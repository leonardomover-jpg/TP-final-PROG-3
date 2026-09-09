# 22 — Página pública + QR + PWA (Etapa 18, solo backend)

## 1. Qué problema resuelve — y decisión de alcance

El roadmap pide una página pública por negocio (catálogo, reserva de
turnos sin login, código QR para imprimir) más una PWA instalable. Ese
alcance completo requiere un frontend real (React + Vite + Tailwind + PWA,
según `01-ANALISIS-Y-ARQUITECTURA.md`), que **no existe en este repo** —
el único frontend presente en la raíz del proyecto pertenece a un proyecto
distinto ("Stock Manager — TIF" / "SH Servicios") y no tiene relación con
PROMPT MAESTRO.

Ante ese fork arquitectónico se preguntó explícitamente cómo seguir. La
decisión fue: **"Solo backend por ahora"** — construir los endpoints
públicos (catálogo del negocio, disponibilidad, reserva sin login) más la
generación del QR en el backend, y documentar acá, explícitamente, que la
página HTML real y la PWA quedan diferidas hasta que exista un proyecto de
frontend. Nada de esto inventa UI no pedida (punto 94/95 del pedido); es
la mitad de la etapa que sí es responsabilidad del backend.

## 2. Dependencias

Depende de `ScheduleService.getAvailability` (Etapa 9), `AppointmentsService.
create` (Etapa 10, ahora exportado desde `AppointmentsModule` para poder
reusarlo desde acá), `PlanLimitsService.assertCanCreate` (Etapa 4/6, para
que el alta pública de un `Client` nuevo respete el límite del plan igual
que el alta desde `ClientsController`), y el paquete `qrcode` (nuevo,
generación de PNG en memoria).

## 3. `PublicTenantGuard` — reusar servicios tenant-scoped sin login

Las rutas públicas van marcadas `@Public()` (sin `JwtAuthGuard`, doc
`04-SEGURIDAD-BASELINE.md`), así que no hay JWT del que sacar el
`tenantId`. En vez de reimplementar `ScheduleService`/`AppointmentsService`
para un camino "sin tenant desde JWT", `PublicTenantGuard`
(`src/public-booking/guards/public-tenant.guard.ts`) resuelve el tenant
desde `:tenantSlug` (`PrismaService` crudo, sin filtro tenant) y setea un
`request.user` **sintético** (`{ tenantId, userId: 'public-booking', email:
'' }`). Como `TenantPrismaService.tenantId` solo lee `request.user?.
tenantId`, cualquier servicio request-scoped inyectado normalmente por
Nest en el controller público (`ScheduleService`, `AppointmentsService`)
queda acotado al tenant correcto sin duplicar ni una línea de su lógica ya
probada.

Un `tenantSlug` que no existe y uno que existe pero no está `active`
(suspendido/cancelado) devuelven el mismo 404 genérico — no filtrar si un
negocio existe pero está suspendido.

## 4. Endpoints

```
GET  /public/:tenantSlug                catálogo público (sin login)
GET  /public/:tenantSlug/availability    disponibilidad (delega en ScheduleService)
POST /public/:tenantSlug/appointments    reserva sin login (10 req/60s)
GET  /public/:tenantSlug/qr              código QR en PNG
```

`GET /public/:tenantSlug` expone solo campos "seguros" de `Branch`
(`id`/`name`/`address`), `Service` (`id`/`name`/`description`/`category`/
`durationMinutes`/`price`) y `Professional` (`id`/`firstName`/`lastName`/
`specialties`) — nunca `tenantId`, costos internos, stock, comisiones ni
notas. `POST .../appointments` (`CreatePublicAppointmentDto`) busca un
`Client` existente por teléfono (preferido) o email dentro del tenant; si
no existe, llama a `PlanLimitsService.assertCanCreate(tenantId, 'clients')`
antes de crearlo — el alta pública de un cliente nuevo bypassea
`ClientsController` (que sí trae `PlanLimitsGuard` en el `@UseGuards` de
clase), así que el chequeo se hace a mano acá para no abrir un agujero al
límite del plan. Después llama a `AppointmentsService.create(...)` tal
cual, con el `clientId` resuelto — cero validación de turnos duplicada.

## 5. QR

`GET /public/:tenantSlug/qr` genera un PNG (`qrcode`, 320×320) que
codifica `${APP_PUBLIC_URL}/api/v1/public/:tenantSlug` — la URL del propio
catálogo JSON. Es un placeholder honesto: todavía no hay una página HTML
para que el QR apunte a algo visualmente armado para el cliente final; el
día que exista el frontend, esta misma línea cambia para apuntar a esa
página en vez de al endpoint JSON, sin tocar nada más de esta etapa.

## 6. Qué NO se hizo en esta etapa (a propósito)

- **Página HTML pública real** ni ningún tipo de renderizado de UI: es
  exactamente lo que la decisión "solo backend por ahora" dejó afuera. El
  QR, hoy, apunta al JSON del catálogo — no a una página para mostrarle al
  cliente.
- **PWA** (manifest, service worker, instalable): depende 100% de que
  exista un proyecto de frontend, que no existe en este repo.
- **Selección de sucursal/negocio por geolocalización o buscador
  público**: fuera del alcance — la página pública es por negocio
  (`:tenantSlug`), no un directorio de negocios.
- **Pago de seña desde la reserva pública**: `Deposit` (Etapa 15) sigue
  siendo un flujo aparte, iniciado por el negocio o desde un endpoint
  autenticado — integrarlo al flujo público es trabajo de frontend/UX que
  no corresponde a esta etapa backend-only.
- **Cancelar/reprogramar un turno sin login**: el turno público solo se
  puede *crear*; cualquier gestión posterior requiere el flujo
  autenticado normal del negocio.

## 7. Tests

`test/public-booking.spec.ts` (11 tests): catálogo público sin
autenticación con solo campos seguros; disponibilidad delegando en
`ScheduleService`; reserva pública crea cliente nuevo + turno; reusa un
cliente existente por teléfono en vez de duplicarlo y rechaza turnos
superpuestos (misma validación de `AppointmentsService.create`); rechaza
la reserva sin teléfono ni email de contacto; respeta el límite de
clientes del plan también en el alta pública (403 al superarlo); aísla el
catálogo entre negocios; un slug inexistente y uno suspendido devuelven el
mismo 404 genérico; el QR devuelve un PNG real; rate limit de 10
req/60s en la reserva pública. 172 tests en la suite completa (11 nuevos).
