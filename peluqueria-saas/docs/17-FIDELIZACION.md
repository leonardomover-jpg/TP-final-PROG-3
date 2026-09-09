# 17 — Fidelización: Puntos, Gift Cards, Referidos, Promociones (Etapa 13)

## 1. Qué problema resuelve

Cuatro módulos opcionales, chicos e independientes entre sí, para que un
negocio retenga y traiga clientes: acumular/canjear puntos, emitir y
canjear tarjetas de regalo, premiar a un cliente que trae a otro, y llevar
un catálogo de promociones. Cada uno vive detrás de su propio feature flag
(`points`, `gift_cards`, `referrals`, `promotions`) — un negocio puede
tener cualquier combinación prendida.

## 2. Dependencias

Depende de: `Client` (Etapa 6, dueño del saldo de puntos y de las gift
cards/referidos), `FeatureFlagGuard`/`RequiresFeature` (Etapa 4, primer uso
real en Products/Etapa 11). Es requisito de: nada todavía — la aplicación
automática de estos beneficios sobre una `Sale` (Etapa 12) queda para una
etapa futura, ver sección 6.

## 3. Modelo de datos

```
LoyaltyPointsTransaction
  id, tenantId, clientId, delta (+otorgado / -canjeado), reason, createdAt

GiftCard
  id, tenantId, code (único por tenant), clientId?, initialBalance,
  balance, status (active|redeemed|cancelled), expiresAt?, createdAt,
  updatedAt

GiftCardTransaction
  id, giftCardId, amount (siempre negativo: solo se registran canjes),
  reason, createdAt

Referral
  id, tenantId, referrerClientId, referredClientId (único por tenant),
  status (pending|completed), rewardPoints?, createdAt

Promotion
  id, tenantId, name, code? (único por tenant), discountType
  (percentage|fixed), discountValue, startsAt?, endsAt?,
  status (active|inactive), createdAt, updatedAt
```

`Client.loyaltyPoints` (nuevo campo, default 0) es el saldo cacheado;
`LoyaltyPointsTransaction` es el ledger inmutable que lo explica — mismo
patrón que el arqueo de caja de la Etapa 12: nunca se pisa un valor
directamente, se registra el movimiento y el saldo es la suma. Igual
relación entre `GiftCard.balance` y `GiftCardTransaction`.

Decisiones de diseño:

- **Puntos**: `POST /points/award` (delta positivo) y `POST /points/redeem`
  (delta negativo, rechaza si `Client.loyaltyPoints < amount`) son los
  únicos dos movimientos — sin caducidad de puntos en esta etapa.
- **Gift cards**: `code` se puede mandar (uppercased, único por tenant,
  409 si ya existe) o se genera solo (10 caracteres hex aleatorios, con
  reintento ante una colisión improbable). `balance` arranca en
  `initialBalance` y solo baja por `POST /:id/redeem`; llegar a 0 cierra
  la tarjeta (`status: redeemed`) automáticamente. Canjear exige
  `status: active`, no vencida (`expiresAt`) y saldo suficiente.
  `GiftCardTransaction` no tiene `tenantId` propio (cuelga de
  `GiftCard.tenantId`), mismo criterio que `SaleItem`/`PurchaseItem`.
- **Referidos**: `referrerClientId !== referredClientId` (400 si no), y
  cada cliente solo puede ser referido una vez por negocio
  (`@@unique([tenantId, referredClientId])`, 409 en un duplicado). Nace
  `pending`; `POST /:id/complete` es una decisión de negocio explícita
  (ej. "el referido ya vino") — nunca se dispara solo desde un `Appointment`
  o una `Sale`. Si el referido tiene `rewardPoints`, completar acredita
  esos puntos al referente reusando el mismo ledger
  (`LoyaltyPointsTransaction`) que usa el módulo Puntos — esto funciona
  aunque el flag `points` esté apagado para ese negocio, porque la
  recompensa es parte del programa de Referidos en sí, no del módulo
  Puntos.
- **Promociones**: CRUD puro, sin aplicación a ninguna `Sale` — ver
  sección 6. `code` es opcional y único por tenant cuando se manda (409 si
  se repite). "Eliminar" pone `status: inactive` (no hay `deletedAt` en
  este modelo, a diferencia de `Product`/`Supplier`).

## 4. Endpoints

```
GET    /points/balance/:clientId          puntos.gestionar
GET    /points/transactions?clientId=     puntos.gestionar
POST   /points/award                      puntos.gestionar
POST   /points/redeem                     puntos.gestionar

GET    /gift-cards                        giftcards.gestionar
GET    /gift-cards/:id                    giftcards.gestionar
POST   /gift-cards                        giftcards.gestionar
POST   /gift-cards/:id/redeem             giftcards.gestionar
POST   /gift-cards/:id/cancel             giftcards.gestionar

GET    /referrals                         referidos.gestionar
GET    /referrals/:id                     referidos.gestionar
POST   /referrals                         referidos.gestionar
POST   /referrals/:id/complete            referidos.gestionar

GET    /promotions                        promociones.gestionar
GET    /promotions/:id                    promociones.gestionar
POST   /promotions                        promociones.gestionar
PATCH  /promotions/:id                    promociones.gestionar
DELETE /promotions/:id                    promociones.gestionar
```

Los cuatro controllers están gateados a nivel de clase con
`@UseGuards(FeatureFlagGuard)` + `@RequiresFeature('points'|'gift_cards'|
'referrals'|'promotions')` — sin el flag correspondiente prendido para el
negocio, nada responde (403), sin importar los permisos de rol del
usuario. Cada módulo usa un único permiso `*.gestionar` (mismo criterio que
`productos.gestionar`/`inventario.gestionar` en la Etapa 11, en vez de
separar ver/crear/editar como `clientes.*`/`turnos.*`).

## 5. Multi-tenancy

`LoyaltyPointsTransaction`/`GiftCard`/`Referral`/`Promotion` se agregaron a
`tenant-scope.extension.ts` con el mismo patrón que
`User`/`Branch`/`Product`. `GiftCardTransaction` no tiene `tenantId` propio
(cuelga de `GiftCard.tenantId`) y no se intercepta —
`GiftCardsService.redeem` valida la pertenencia de la `GiftCard` antes de
escribir, mismo criterio que `SaleItem`/`PurchaseItem` en Etapas 11/12.

## 6. Qué NO se hizo en esta etapa (a propósito)

- **Ningún hook automático desde `Sale` (Etapa 12)**: crear una venta no
  otorga puntos, no descuenta una gift card ni aplica una `Promotion` al
  total — cada beneficio se otorga/canjea/aplica solo por su propio
  endpoint explícito. Evita modificar retroactivamente el `SalesService`
  ya probado de la Etapa 12 con efectos secundarios condicionados a
  feature flags; es la extensión natural de una etapa futura si el pedido
  lo pide en concreto (ej. "al cerrar la venta, sumar 1 punto cada
  $X"), no antes.
- **Caducidad de puntos**: `LoyaltyPointsTransaction` no tiene fecha de
  vencimiento; el saldo es indefinido hasta que se canjea.
- **Página pública / QR para que el cliente consulte su propio saldo o
  gift card**: eso es la Etapa 18 (Página pública/QR/PWA); acá los
  endpoints son solo para el mostrador (`*.gestionar`).
- **Notificación al cliente** (WhatsApp/email) al otorgar puntos, emitir
  una gift card o completar un referido: Etapa 14 (Notificaciones) y
  Etapa 16 (WhatsApp) todavía no existen.
- **Aplicación automática de `Promotion` por código en el checkout**: el
  modelo es un catálogo consultable; validar vigencia (`startsAt`/
  `endsAt`) y aplicar el descuento a una venta es lógica de una etapa
  futura que sí toque `SalesService`.

## 7. Tests

`test/loyalty.spec.ts` (14 tests): sin el feature flag habilitado ningún
endpoint de los cuatro módulos responde (403); otorgar puntos y consultar
saldo/ledger; canjear puntos y rechazo por saldo insuficiente; emitir gift
card con código autogenerado y con código propio (409 en un duplicado);
canjear saldo parcial, rechazo al canjear de más, cierre automático al
llegar a 0, cancelar una tarjeta activa (y que ya no admita canjes ni
cancelarse dos veces), rechazo al canjear una tarjeta vencida; registrar y
completar un referido (acredita los puntos de recompensa al referente, no
se puede completar dos veces), rechazo de auto-referido y de un referido
duplicado; CRUD de promociones con código único por negocio; aplicación
real de los permisos `*.gestionar` (el rol "Profesional" no puede);
aislamiento multi-tenant completo en los cuatro módulos. 119 tests en la
suite completa (14 nuevos de esta etapa).
