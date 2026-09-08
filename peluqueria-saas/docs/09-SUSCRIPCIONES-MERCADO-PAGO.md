# 09 — Suscripciones + Mercado Pago (Etapa 5)

## 1. Qué problema resuelve

El billing de la propia plataforma: cómo un negocio pasa de "recién
registrado" a "pagando su plan SaaS todos los meses", y cómo el sistema se
entera de que un pago se acreditó sin tener que confiar en el navegador del
que paga.

## 2. Dependencias

Depende de: `Plan`/`FeatureFlag` (Etapa 4), `Subscription`/
`SubscriptionPayment` (modelo ya diseñado en la Etapa 1). Es requisito de:
cualquier enforcement futuro de "suscripción vencida degrada el acceso"
(explícitamente fuera de scope de esta etapa, ver sección 7).

## 3. Principio de no inventar APIs (punto 94 del pedido)

Antes de escribir una sola línea de `MercadoPagoService`, se consultó la
documentación oficial de Mercado Pago Developers (Checkout Pro / Preferences
API, notificaciones Webhooks) vía búsqueda y fetch de páginas oficiales y
fuentes secundarias que citan esa documentación textualmente. **Nota
honesta**: el proxy de red de este entorno bloquea el acceso directo a los
dominios `mercadopago.com.*` (`EGRESS_BLOCKED`), así que la forma exacta del
endpoint y del algoritmo de firma se confirmó cruzando **dos fuentes
independientes** que citan la documentación oficial textualmente (no una
sola, para reducir el riesgo de un dato inventado o desactualizado):

- Endpoint `POST /checkout/preferences`, headers, body (`items`,
  `external_reference`, `notification_url`) y respuesta (`init_point`,
  `sandbox_init_point`).
- Formato del header `x-signature: ts=...,v1=...` y el manifest exacto para
  HMAC-SHA256: `id:{dataId};request-id:{requestId};ts:{ts};` (segmentos
  omitidos si el dato no vino), comparado en tiempo constante.
- `GET /v1/payments/{id}` para el detalle real del pago (nunca se confía en
  el body de la notificación, que solo trae el id).

**Antes de ir a producción con esto**, hay que volver a verificar estos tres
puntos contra la documentación oficial vigente desde un entorno sin el
bloqueo de red (punto 94: "verificar versión actual" es un paso continuo,
no algo que se hace una sola vez).

## 4. MercadoPagoService — encapsulado, cuenta de la plataforma

`src/mercado-pago/` es el único lugar que hace `fetch` a
`api.mercadopago.com`. Es la cuenta de Mercado Pago **de la plataforma**
(cobra la suscripción SaaS a cada negocio) — no confundir con Mercado Pago
para que un negocio le cobre a SUS clientes (señas, ventas), que es un
`TenantIntegration` por-negocio de la Etapa 15 (doc `05` §6). Nunca se
tocan datos de tarjeta: todo el checkout ocurre en la página hospedada por
Mercado Pago (Checkout Pro), así que "no almacenar tarjetas" se cumple por
diseño.

## 5. Flujo completo

```
POST /subscription/select-plan { planId }
  → Subscription en estado "trial" (14 días) + Tenant.planId sincronizado
    (así FeatureFlagsService/PlanLimitsService de la Etapa 4 ya ven el plan
    elegido, aunque todavía no se haya pagado nada)

POST /subscription/checkout
  → MercadoPagoService.createPreference() con external_reference =
    subscription.id → devuelve la URL de pago (init_point)

[el dueño del negocio paga en la página de Mercado Pago]

POST /webhooks/mercado-pago (llamado por Mercado Pago, público)
  → valida x-signature (rechaza con 401 si no matchea)
  → GET /v1/payments/{id} para el estado real
  → busca la Subscription por external_reference
  → crea SubscriptionPayment (idempotente por @@unique([provider, providerPaymentId]))
  → si el pago está "approved": status="active", se extiende currentPeriodEnd
```

## 6. Idempotencia real (punto 65 del pedido)

Nunca se asume que un webhook llega una sola vez. La garantía no es "se
revisa si ya existe antes de insertar" (que tiene una condición de carrera
entre el check y el insert) — es el propio `@@unique([provider,
providerPaymentId])` de `SubscriptionPayment`, ya diseñado desde la Etapa
1: el segundo intento de insertar el mismo pago falla con `P2002`, y el
handler lo trata como `alreadyProcessed`, no como error. Se testea
explícitamente enviando la misma notificación dos veces y confirmando que
ni se duplica el pago ni se extiende el período dos veces.

## 7. Qué NO se hizo en esta etapa (a propósito)

- **Procesamiento del webhook fuera de la request HTTP**: no existe
  infraestructura de colas (Redis/BullMQ) todavía en el proyecto — se
  documentó como transversal futuro desde la Etapa 1 (doc `01` §4) pero
  ninguna etapa construida hasta ahora la necesitaba. El webhook de esta
  etapa se procesa síncronamente porque es rápido (una consulta HTTP a
  Mercado Pago + un par de escrituras), no porque esté bien dejarlo así
  para siempre — cuando exista infraestructura de jobs (necesaria de
  todos modos para recordatorios de WhatsApp en la Etapa 16), este
  handler pasa a encolar en vez de procesar inline.
- **Downgrade automático a `past_due`/`suspended` por vencimiento**: eso
  requiere un job programado (cron) que no existe todavía por la misma
  razón. Por ahora, `GET /subscription` calcula `expiringSoon`/`expired`
  **en el momento de la lectura**, con la fecha del servidor — nunca
  persistido como un cambio de estado silencioso. El corte real de acceso
  por suscripción vencida (a diferencia de por negocio suspendido por
  SUPER ADMIN, que sí es inmediato desde la Etapa 3) queda para cuando
  exista esa infraestructura de jobs.
- **Selección de plan obligatoria en el registro**: `POST
  /auth/register-tenant` (Etapa 2) sigue sin pedir plan — coincide con el
  flujo de onboarding del propio pedido (punto 67: "Crear negocio" y
  "Elegir plan" son pasos separados). Este endpoint (`select-plan`) es
  justamente ese paso siguiente.

## 8. Un bug real de NestJS encontrado y corregido en esta etapa

`SubscriptionsService` inyecta tres dependencias: `TenantPrismaService`
(request-scoped), `PrismaService` y `MercadoPagoService` (de otro módulo).
Con esa combinación específica, la propagación automática de scope de
NestJS **no** marcaba el service como request-scoped de forma consistente:
`TenantPrismaService` terminaba resolviéndose fuera de un request real
(`@Inject(REQUEST)` llegaba `undefined`, no solo `request.user`
undefined como en el bug de la Etapa 2). Se reprodujo de forma
determinística (falla siempre, no es un problema de orden de arranque) y se
aisló quitando la dependencia de `MercadoPagoService` una por una hasta
confirmar la causa. La solución fue forzar `@Injectable({ scope:
Scope.REQUEST })` explícitamente en vez de confiar en la detección
automática — documentado en el propio archivo
(`subscriptions.service.ts`) para que no se repita el mismo diagnóstico si
aparece de nuevo en un service futuro con una combinación de dependencias
parecida (request-scoped + singleton propio + singleton de otro módulo).

## 9. Tests

`test/subscriptions.spec.ts`: elegir plan sincroniza `Tenant.planId`;
`daysRemaining`/`expiringSoon` calculados con fecha del servidor; checkout
llama a Mercado Pago (mockeado, sin tocar la red real); webhook con firma
inválida rechazado; flujo completo checkout → webhook aprobado →
suscripción activa; webhook duplicado no reprocesa ni re-extiende el
período; SUPER ADMIN ve las suscripciones de todos los negocios. 53 tests
en la suite completa (6 nuevos de esta etapa).
