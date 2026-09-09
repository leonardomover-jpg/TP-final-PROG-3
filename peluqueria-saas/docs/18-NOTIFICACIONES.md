# 18 — Notificaciones: centro + canales internos (Etapa 14)

## 1. Qué problema resuelve

Dos cosas, del punto 58 del pedido: (1) que un usuario del negocio vea en
un solo lugar tanto las comunicaciones globales que emite SUPER ADMIN
(Etapa 3, hasta ahora sin consumo del lado negocio) como los avisos
internos que el propio backend genera ante eventos (stock bajo, uso del
plan cerca del límite); y (2) que esos avisos internos existan de verdad,
no solo el modelo de datos. Los canales EXTERNOS (WhatsApp, email) son
etapas futuras (16 en adelante) — esta etapa es el canal interno
("centro de notificaciones" dentro del panel del negocio).

## 2. Dependencias

Depende de: `Communication`/`CommunicationTenant` (Etapa 3), `Product`
(Etapa 11, trigger de stock bajo), `Sale` (Etapa 12, mismo trigger), `Plan`/
`PlanLimitsService` (Etapa 4, trigger de límite de plan), RBAC (Etapa 2,
para decidir a quién avisar). No depende de ningún feature flag — el
centro de notificaciones es infraestructura base, no un módulo opcional.

## 3. Modelo de datos

```
Notification
  id, tenantId, userId, type (low_stock|plan_limit_warning), title, body,
  metadata?, readAt?, createdAt

CommunicationRead
  userId, communicationId, readAt   (clave compuesta [userId, communicationId])
```

Decisiones de diseño:

- **`Notification` es el buzón propio de un `User`**: lo genera el backend
  ante un evento (nunca el cliente vía API — no hay `POST /notifications`).
  Tiene `tenantId` propio como cualquier otro modelo de negocio.
- **`Communication` NO se duplica por usuario**: sigue siendo una única
  fila por comunicación (Etapa 3); `CommunicationRead` es solo el
  marcador de "este User ya la vio", cruzado en runtime contra la
  resolución de audiencia (`all` / `plan` que coincide con
  `Tenant.planId` / `tenants` que incluye este tenant) — mismo criterio de
  "resolver en runtime, no duplicar" que ya usa la jerarquía de Feature
  Flags (doc 03 §3).
- **`NotificationsService` es un singleton sin estado**, usando
  `PrismaService` crudo con `tenantId` agregado a mano en cada query — NO
  `TenantPrismaService`. Motivo concreto: lo inyectan tanto services
  request-scoped (`ProductsService`, `SalesService`) como uno que no lo es
  en absoluto (`PlanLimitsService`, resuelto desde un `Guard`); atarlo a
  `TenantPrismaService` habría forzado a `PlanLimitsService` — y por lo
  tanto a `PlanLimitsGuard`, usado en Users/Branches/Clients/Professionals
  — a volverse request-scoped también, arrastrando exactamente el bug de
  scope documentado en Etapas 2/5/10. Mismo molde ya usado por
  `FeatureFlagsService`/`PlanLimitsService`/`PlanInfoService`. `Notification`
  y `CommunicationRead` por eso NO pasan por
  `tenant-scope.extension.ts` — ver el comentario ahí para el detalle
  completo.

## 4. Endpoints

```
GET    /notifications                        (sin permiso especial — bandeja propia)
GET    /notifications/unread-count            (sin permiso especial)
PATCH  /notifications/:id/read                 (sin permiso especial)
PATCH  /notifications/communications/:id/read   (sin permiso especial)
PATCH  /notifications/read-all                   (sin permiso especial)
```

Sin `@RequirePermissions` a propósito, mismo criterio que `GET /plan`
(`PlanInfoController`, Etapa 4): cualquier usuario autenticado del negocio
ve y administra SU PROPIA bandeja — nunca la de otro usuario del mismo
tenant (`markNotificationRead` valida `userId` además de `tenantId`).
`GET /notifications` devuelve una lista combinada y ordenada por fecha,
cada ítem con `source: 'system' | 'communication'`.

## 5. Quién dispara qué aviso interno

- **Stock bajo** (`type: 'low_stock'`): se dispara en el CRUCE hacia stock
  bajo (`newStock <= minStock` y el stock anterior NO estaba ya bajo) —
  nunca se repite en cada ajuste posterior si sigue bajo. Dos puntos de
  disparo: `ProductsService.adjustStock` (Etapa 11, ajuste manual) y
  `SalesService.create` (Etapa 12, después de confirmada la transacción —
  nunca si la venta falla), sobre una foto de `stock`/`minStock` tomada
  antes de descontar. Avisa solo a los usuarios del tenant con el permiso
  `inventario.gestionar` (no a todo el negocio a ciegas).
- **Aviso de límite de plan** (`type: 'plan_limit_warning'`): se dispara
  dentro de `PlanLimitsService.assertCanCreate`, justo después de permitir
  la creación (nunca si la rechaza), comparando el % de uso ANTES vs.
  DESPUÉS de esa alta puntual contra los umbrales 75%/90%. No hace falta
  guardar en ningún lado "ya avisé este umbral" — el cruce se deduce de la
  aritmética del conteo mismo (`before < umbral <= after`), así que un
  segundo alta que ya está por encima del umbral no vuelve a avisar. Avisa
  a los usuarios con `suscripcion.gestionar` (quienes pueden efectivamente
  mejorar el plan). Idea del punto 8 de `05-OBSERVACIONES-Y-RIESGOS.md`.
- **Comunicaciones globales**: no las "dispara" nadie del lado negocio —
  ya existen desde que SUPER ADMIN las crea (Etapa 3); esta etapa solo las
  hace visibles y marcables como leídas del lado negocio.

## 6. Qué NO se hizo en esta etapa (a propósito)

- **Canales externos** (email, WhatsApp, push del navegador): esta etapa
  es solo el canal interno (dentro del panel). WhatsApp es la Etapa 16.
- **Auto-oferta de lista de espera** cuando se libera un turno cancelado
  (mencionado como pendiente en `14-AGENDA-TURNOS.md` §7): un
  `WaitlistEntry.clientId` es un Cliente, no un `User` — no tiene sesión
  ni bandeja propia en este sistema. Avisarle de verdad requiere un canal
  externo (WhatsApp/email), así que se corre más adelante, a cuando ese
  canal exista (Etapa 16), no a este centro de notificaciones interno.
- **Jobs en background / notificaciones programadas** (ej. recordatorio de
  turno mañana a las 9am): la Capa Transversal "Jobs en background"
  (doc 01) todavía no está implementada; todo lo de esta etapa se dispara
  de forma síncrona dentro del request que originó el evento, no por un
  cron.
- **Targeting por rol específico más allá de un permiso**: se avisa a
  "todos los que tienen el permiso X", no a un subconjunto más fino (ej.
  "solo al dueño"). Suficiente para el tamaño de equipo típico de un
  salón; una segmentación más fina es una extensión futura si se pide.
- **Notificaciones de Fidelización** (Etapa 13: otorgar puntos, emitir una
  gift card, completar un referido): quedaron explícitamente diferidas en
  `docs/17-FIDELIZACION.md` §6 a esta etapa y a WhatsApp (Etapa 16); no se
  agregaron acá porque targetean al Cliente, no a un `User` — mismo motivo
  que la auto-oferta de lista de espera.
- **Borrado/archivado de notificaciones**: hoy son de solo lectura una vez
  creadas (se pueden marcar leídas, no eliminar) — un historial completo
  es preferible a perder el registro de qué pasó.

## 7. Tests

`test/notifications.spec.ts` (8 tests): cada negocio ve solo las
comunicaciones que le aplican según su audiencia (`all`/`plan`/`tenants`,
cruzando contra el plan real del tenant); marcar una comunicación como
leída actualiza el contador de no leídas, y no se puede marcar una que no
aplica a este tenant (404); `ProductsService.adjustStock` avisa al cruzar
el mínimo de stock y NO repite el aviso en un ajuste posterior si ya
estaba bajo; `SalesService.create` avisa cuando una venta hace cruzar el
mínimo; solo avisa a usuarios con `inventario.gestionar` (un empleado sin
ese permiso no la recibe); el aviso de límite de plan se dispara una única
vez al cruzar 75%/90% del límite de usuarios (con el umbral más alto
cuando se cruzan ambos de una); marcar una notificación de sistema propia
como leída, y que otro usuario/tenant no pueda marcarla (404);
`read-all` deja el contador de no leídas en 0 (notificaciones propias +
comunicaciones aplicables). 127 tests en la suite completa (8 nuevos).
