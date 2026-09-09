# 19 — Mercado Pago para clientes: integraciones + señas (Etapa 15)

## 1. Qué problema resuelve

Que un negocio cobre señas/adelantos a SUS clientes para confirmar un
turno, usando SU PROPIA cuenta de Mercado Pago — no la de la plataforma
(esa es la Etapa 5, billing SaaS). Dos piezas: (1) que cada tenant conecte
sus propias credenciales de forma segura, y (2) el flujo de seña en sí
(checkout, webhook, conciliación con el turno).

## 2. Dependencias

Depende de: `MercadoPagoService`/`mercado-pago-client.ts` (Etapa 5,
refactorizado en esta etapa para reusar sus funciones con credenciales
por-tenant), `Appointment` (Etapa 10), `NotificationsService` (Etapa 14,
avisa cuando se confirma una seña). Es requisito de: nada todavía — el
pago de servicios/productos sin turno de por medio queda deliberadamente
fuera de esta etapa, ver sección 6.

## 3. Modelo de datos

```
TenantIntegration
  id, tenantId, provider ("mercado_pago"), status (connected|disconnected),
  publicKey?, encryptedAccessToken?, encryptedWebhookSecret?, connectedAt?

Deposit
  id, tenantId, appointmentId (único — 1:1), amount, status
  (pending|approved|rejected|cancelled), mpPreferenceId?, mpPaymentId? (único)
```

Decisiones de diseño:

- **Credenciales cifradas, nunca en texto plano** (doc
  `05-OBSERVACIONES-Y-RIESGOS.md` §6): AES-256-GCM
  (`src/common/crypto/tenant-secret-cipher.ts`) con clave de LA PLATAFORMA
  (`TENANT_SECRETS_ENCRYPTION_KEY`, env var, 32 bytes en hex) — un secreto
  distinto de cualquier otro ya usado (JWT, MFA, etc.). Se descifran SOLO
  en memoria, justo antes de llamar a la API de Mercado Pago o verificar
  una firma de webhook; ningún endpoint los devuelve jamás
  (`IntegrationsService` usa un `select` fijo que los excluye siempre).
- **El access token se valida contra la API real antes de guardarlo**
  (`GET /users/me`) — mismo principio de "no asumir, verificar" ya
  aplicado con la firma de webhooks en la Etapa 5. Un token inválido se
  rechaza con 400 y no se persiste nada.
- **`mercado-pago-client.ts`**: las tres funciones de comunicación con
  Mercado Pago (`createPreference`, `getPayment`,
  `verifyWebhookSignature`, más la nueva `validateAccessToken`) se
  extrajeron de `MercadoPagoService` a funciones puras parametrizadas por
  credenciales — se reusan tal cual desde el flujo de plataforma (env
  vars, comportamiento externo idéntico al de antes de esta etapa) y
  desde el flujo por-tenant (credenciales descifradas de
  `TenantIntegration`).
- **`Deposit` es 1:1 con `Appointment`** (no un ledger de varios pagos por
  turno, a diferencia de `Subscription`/`SubscriptionPayment` que sí
  necesita repetirse mes a mes): una seña es un cobro único, así que
  `mpPaymentId` (único) alcanza como marca de idempotencia directamente
  sobre la fila, sin necesitar una tabla aparte.
- **El checkout lo genera el negocio, no hay página pública todavía**:
  `POST /deposits` devuelve `initPoint`/`sandboxInitPoint` y el negocio
  comparte ese link con el cliente por el canal que tenga hoy (todavía no
  existe Página pública/QR, Etapa 18, ni WhatsApp automatizado, Etapa 16)
  — mismo patrón ya usado en `POST /subscription/checkout` (Etapa 5).
- **El estado real de la seña solo lo confirma el webhook**, nunca el
  cliente ni este mismo endpoint — mismo principio de "no confiar en el
  cliente para montos/estados de dinero" ya aplicado en Suscripciones y
  Ventas.
- **Webhook por tenant, no compartido**: `POST
  /webhooks/mercado-pago/tenant/:tenantId` (público, sin JWT — un webhook
  no trae ninguno) resuelve las credenciales de ESE tenant a partir del
  `tenantId` de la URL (el mismo que se pasó como `notification_url` al
  crear la preferencia) ANTES de verificar la firma — la firma se calcula
  con el `webhookSecret` de ese tenant, no el de la plataforma. Un tenant
  sin integración conectada, o un `external_reference` que no corresponde
  a una `Deposit` de ese tenant, se ignora con 200 (no se reintenta) en
  vez de fallar.

## 4. Endpoints

```
GET    /integrations                        integraciones.gestionar
POST   /integrations/mercado-pago/connect    integraciones.gestionar
DELETE /integrations/mercado-pago            integraciones.gestionar

GET    /deposits?appointmentId=              senas.gestionar
GET    /deposits/:id                         senas.gestionar
POST   /deposits                             senas.gestionar

POST   /webhooks/mercado-pago/tenant/:tenantId   (público, sin JWT)
```

## 5. Multi-tenancy

`TenantIntegration`/`Deposit` se agregaron a `tenant-scope.extension.ts`
con el mismo patrón que `User`/`Branch`/`Product`. El webhook por tenant
es la única excepción real del sistema a "siempre `TenantPrismaService`"
en un endpoint público — usa `PrismaService` crudo porque resuelve el
tenant desde la URL, no desde un JWT, y valida explícitamente que el
`Deposit` encontrado por `external_reference` pertenezca al `tenantId` de
la URL antes de tocarlo (para que un tenant no pueda, ni por error de
configuración, confirmar la seña de otro).

## 6. Qué NO se hizo en esta etapa (a propósito)

- **Pago de servicios/productos sin turno de por medio** (ej. un cliente
  compra un producto online): sin Página pública (Etapa 18) no hay desde
  dónde originar ese checkout — inventar un endpoint sin una pantalla real
  que lo use sería anticipar UI que el pedido no pidió todavía (punto 94
  del pedido: no inventar sin verificar la necesidad concreta).
- **Reconciliación con `Sale`/`SalePayment` (Etapa 12)**: una seña
  aprobada NO crea automáticamente una `Sale` ni un `SalePayment` — el
  mostrador sigue registrando la venta final a mano (con el medio de pago
  que corresponda) cuando el cliente llega a su turno. Integrar ambos
  flujos de forma segura (¿la seña se descuenta del total? ¿qué pasa si
  el cliente no viene?) es una extensión futura una vez que el pedido
  concreto lo pida, no antes — mismo criterio de restricción ya aplicado
  con Fidelización (Etapa 13) y `SalesService`.
- **Reembolsos**: Mercado Pago soporta devolver un pago, pero no hay
  endpoint para eso en esta etapa — un negocio que necesita devolver una
  seña lo hace hoy desde su propio dashboard de Mercado Pago.
- **Multi-currency**: igual que Etapa 5, todo en ARS (`Tenant.currency`
  existe en el modelo pero no se usa todavía para elegir moneda).
- **UI de conexión con OAuth de Mercado Pago** ("Conectar con Mercado
  Pago" con redirect): se optó por pegar el access token a mano
  (`POST /integrations/mercado-pago/connect`), igual de válido y
  muchísimo más simple de implementar/testear en esta etapa; migrar a
  OAuth es una mejora de UX, no de funcionalidad.

## 7. Tests

`test/deposits.spec.ts` (8 tests): rechaza conectar con un access token
inválido sin guardar nada (verificado contra la API real antes de
persistir); conecta con un token válido sin exponer los secretos en
ninguna respuesta; rechaza generar una seña para un turno inexistente;
genera una seña con el checkout de la cuenta del propio negocio y rechaza
una segunda seña para el mismo turno (409); el webhook confirma la seña
con la firma de ESE negocio, avisa una sola vez aunque Mercado Pago
reenvíe la misma notificación, y rechaza una firma inválida (401); un
webhook para un tenant sin Mercado Pago conectado se ignora con 200;
aplicación real de `integraciones.gestionar`/`senas.gestionar`; aislamiento
multi-tenant completo (señas, y que un tenant no pueda generar una seña
usando el turno de otro tenant aunque adivine su id). 135 tests en la
suite completa (8 nuevos).
