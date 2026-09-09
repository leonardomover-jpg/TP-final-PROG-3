# 26 — Auditoría avanzada y Observabilidad (Etapa 22)

## 1. Qué problema resuelve

El roadmap pide "auditoría avanzada y observabilidad (dashboards de
logs/métricas), más allá del `AuditLog` ya modelado en Etapa 1". Al
revisar el estado real: `AuditLog` existía desde la Etapa 1, pero solo lo
escribían a mano un puñado de acciones puntuales (login, registro de
tenant, webhook de Mercado Pago, y algunas acciones de SUPER ADMIN en
`platform-admin/tenants`, `communications`, `support`) — el resto del
sistema (turnos, ventas, productos, y hasta partes de SUPER ADMIN como
`plans`/`feature-flags`/`holidays`) no dejaba ningún rastro. Y ningún
negocio podía ver su PROPIO registro de auditoría — solo SUPER ADMIN
(Etapa 3) podía leerlo, y de todos los tenants a la vez.

Dos gaps reales, dos soluciones concretas:
1. **Cobertura de auditoría angosta** → `AuditInterceptor` global.
2. **Sin visibilidad propia para el negocio** → `GET /audit`.
3. Bonus del "y Observabilidad" del título: `GET /health`.

## 2. `AuditInterceptor` — cobertura amplia, sin tocar cada service

`src/audit/audit.interceptor.ts`, registrado globalmente
(`APP_INTERCEPTOR`, `AuditModule`) — complementa, no reemplaza, los
`auditLog.create` puntuales que ya existían. Por cada mutación exitosa
(POST/PUT/PATCH/DELETE, nunca GET) en cualquier endpoint autenticado,
escribe una fila genérica: actor (de `request.user`, sea negocio o
SUPER ADMIN), `action` (`método:entidad`, ej. `post:branches`),
`entityType` (primer segmento de la URL después de `/api/v1/` y, si
aplica, después de `/platform-admin/`), `entityId` (si la ruta trae `:id`
— en un alta no hay, el id lo genera la respuesta, no la URL), ip y
user-agent. Sin `beforeData`/`afterData`: eso queda para los
`auditLog.create` manuales de acciones específicamente sensibles (ver
§4).

Es intencional que una acción con logging manual (ej. `user.login`)
termine con DOS filas: una genérica de acá, una semántica con detalle de
la implementación puntual — capas complementarias, no un bug de
duplicación.

Un GET/HEAD nunca genera fila (nada cambió). Un endpoint sin actor
identificable (login, webhooks, catálogo público) tampoco: `request.user`
nunca llega a setearse ahí (no hay `JwtAuthGuard` real que corra), así
que no hizo falta armar una lista de exclusión por path. La única
excepción explícita es el `request.user` SINTÉTICO de `PublicTenantGuard`
(Etapa 18, `userId: 'public-booking'`): una reserva pública anónima no
genera auditoría de "usuario" a propósito.

La escritura se espera (`concatMap`, no `tap`) antes de que la respuesta
baje al cliente — necesario para que `GET /audit` inmediatamente después
de una mutación ya vea la fila, sin condición de carrera en los tests.

## 3. `GET /audit` — auditoría propia del negocio

```
GET /audit?actorType=&action=&entityType=&from=&to=&page=&limit=   auditoria.ver
```

Nuevo permiso `auditoria.ver`. `AuditService` usa `PrismaService` crudo
con `tenantId` SIEMPRE del JWT (mismo criterio que `NotificationsService`,
Etapa 14) — `AuditLog` no pasa por `tenant-scope.extension.ts` porque
también lo escriben acciones de SUPER ADMIN con `tenantId` null, así que
filtrar a mano evita cualquier ambigüedad. Mismo shape de paginación que
`platform-admin/audit-logs` (Etapa 3), sin el filtro `tenantId` (acá
nunca lo manda el cliente).

## 4. `GET /health` — observabilidad mínima

Endpoint público (sin JWT — lo pega un monitor de uptime, no una
persona logueada) que verifica conectividad REAL a Postgres
(`SELECT 1`), no solo "el proceso está vivo": `{"status":"ok","database":
"ok","uptimeSeconds":123}`, o 503 si la base no responde.

## 5. Qué NO se hizo en esta etapa (a propósito)

- **Dashboards visuales de logs/métricas**: el roadmap los menciona, pero
  sin un frontend (mismo motivo que Etapas 18/20/21) esto es una API —
  `GET /audit` es el dato crudo, un dashboard sobre eso queda para cuando
  exista un frontend.
- **Prometheus/métricas exportables** (`/metrics` estilo Prometheus,
  contadores de requests, latencias): un solo endpoint de salud simple
  cubre lo esencial para un monitor de uptime; una integración de
  métricas real (Prometheus, Datadog, etc.) es una decisión de
  infraestructura de despliegue, más propia de la Etapa 26 (Deploy) que
  de esta.
- **`beforeData`/`afterData` en las entradas genéricas**: agregar diffs
  de antes/después a CADA mutación del sistema exigiría tocar todos los
  services existentes (arriesgando romper código ya probado) — se
  mantienen los diffs solo en las acciones que ya los tenían a mano
  (login, cambios de estado de tenant, etc.).
- **Retención/purga de AuditLog**: sin límite de antigüedad ni archivado
  — para un negocio real con volumen alto esto crecería indefinidamente,
  pero no hay jobs en background todavía (mismo motivo de restricción que
  recordatorios de WhatsApp, Etapas 16/17) para programar una purga.
- **Backfill de auditoría para `plans`/`feature-flags`/`holidays` de
  SUPER ADMIN con logging manual detallado**: quedan cubiertos por el
  `AuditInterceptor` genérico (nueva cobertura real, antes no tenían
  nada), sin agregarles además diffs semánticos punto por punto —
  mismo criterio de "cobertura amplia sin invasión" de arriba.

## 6. Tests

`test/audit.spec.ts` (6 tests): el registro de un tenant ya genera una
entrada semántica (`tenant.registered`); una mutación (`POST /branches`)
genera una entrada genérica vía el interceptor; un GET no genera
ninguna; filtro por rango de fechas; sin `auditoria.ver` responde 403;
aislamiento multi-tenant (un negocio nuevo solo ve su propio
`tenant.registered`). `test/health.spec.ts` (1 test): responde 200 sin
autenticación con conectividad real verificada. 202 tests en la suite
completa (7 nuevos).
