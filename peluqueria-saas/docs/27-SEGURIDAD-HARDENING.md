# 27 — Seguridad hardening (Etapa 23)

## 1. Qué pide esta etapa

Doc `06-ROADMAP-ETAPAS.md`: "RLS de Postgres activado (ver doc `02`),
pentest interno (checklist del doc `04` sección 10). El rate limiting
global ya se implementó en la Etapa 3."

## 2. RLS: activado como capa 2, deliberadamente sin `FORCE`

Antes de escribir la migración se investigó empíricamente (con un
experimento directo contra la base de este proyecto) cómo integrar Row-
Level Security de Postgres con Prisma Client Extensions, que es como está
armado `tenant-scope.extension.ts` (capa 1, la que protege HOY). Dos
hallazgos concretos cambiaron el alcance:

1. **`ENABLE ROW LEVEL SECURITY` sin `FORCE` no restringe al dueño de la
   tabla** — y esta app conecta a Postgres con un único rol, dueño de
   todas las tablas (un solo `DATABASE_URL`). Activar `FORCE` se probó
   directamente: rompe TODO el código que hoy usa `PrismaService` crudo
   a propósito sin setear ningún contexto de tenant —
   `NotificationsService`, `PlanLimitsService`, `FeatureFlagsService`,
   los cuatro webhooks, y los ocho services de `platform-admin/*` (que
   necesitan leer/escribir A PROPÓSITO a través de todos los tenants).
   Forzarlo sin antes crear un rol de Postgres separado y de menor
   privilegio para las queries tenant-scoped dejaría el sistema
   completo respondiendo vacío.
2. **Setear `SET LOCAL`/`set_config` por-operación vía una Prisma Client
   Extension choca con las transacciones interactivas ya usadas en el
   código** (`SalesService`, `CashRegisterService`, `PurchasesService`,
   etc. usan `$transaction(async (tx) => {...})` para atomicidad).
   Envolver cada operación individual en su propia mini-transacción
   (`$transaction([setConfig, query])`, técnica confirmada funcional en
   el experimento) ejecuta esa mini-transacción sobre el cliente base,
   NO sobre el `tx` de la transacción interactiva ya abierta — rompería
   la atomicidad de esas operaciones (la razón por la que existen).

**Decisión**: se activa RLS (`ENABLE ROW LEVEL SECURITY` + una política
`tenant_isolation` correcta por tabla) en las 28 tablas tenant-scoped,
sin `FORCE`. Hoy es 100% inerte para la conexión actual (verificado: la
suite completa de 202 tests pasó sin cambios después de aplicar la
migración) — dicho con todas las letras, no es "protección real todavía".
Es la base de datos completamente lista para el día que se cree un rol
de Postgres restringido (sin `BYPASSRLS`, dedicado a las queries
tenant-scoped) — activar la capa 2 de verdad en ese momento es un solo
`ALTER TABLE ... FORCE ROW LEVEL SECURITY` por tabla, sin tocar ninguna
política. Ver la migración
`prisma/migrations/20260909180948_etapa23_enable_row_level_security/` para
el detalle completo, incluyendo por qué `Role` permite filas con
`tenantId IS NULL` (roles de sistema compartidos) y `AuditLog` NO
(acciones de SUPER ADMIN, ningún tenant debe verlas nunca).

## 3. Cabeceras HTTP de seguridad (`helmet`)

`main.ts`/`test/setup.ts` ahora aplican `helmet()` (con
`contentSecurityPolicy: false` — es una API JSON pura, sin HTML propio
que proteger con CSP). Antes: `X-Powered-By: Express` filtraba el stack
tecnológico en cada respuesta. Ahora: `X-Content-Type-Options: nosniff`,
`X-Frame-Options: SAMEORIGIN`, `Strict-Transport-Security`, etc.,
presentes; `X-Powered-By` ausente.

## 4. Pentest interno — checklist doc `04` §10

| Ítem | Estado | Dónde se verifica |
|---|---|---|
| Tenant A no lee/escribe datos de Tenant B (ID directo y enumeración) | ✅ | `test/tenant-isolation.spec.ts` (desde la Etapa 2) |
| Usuario sin permiso `X` recibe 403 en la acción que requiere `X` | ✅ | `test/permissions.spec.ts` + casi todos los `*.spec.ts` de cada módulo |
| JWT expirado o manipulado (firma inválida) es rechazado | ✅ (nuevo) | `test/security-hardening.spec.ts` — no tenía cobertura EXPLÍCITA hasta esta etapa; ahora cubre firma manipulada, expiración, y un JWT bien firmado pero de un usuario/tenant que no existe |
| Webhook con firma inválida es rechazado, no se procesa | ✅ | `test/deposits.spec.ts`, `test/whatsapp.spec.ts`, `test/meta-messaging.spec.ts`, `test/subscriptions.spec.ts` |
| Webhook duplicado no duplica el efecto | ✅ | `test/deposits.spec.ts` ("avisa una sola vez"), `test/subscriptions.spec.ts` ("el webhook duplicado no reprocesa") |

Revisión ampliada (más allá del checklist mínimo, mismo criterio de
"pentest interno"):

- **Mass assignment**: `ValidationPipe({ whitelist: true,
  forbidNonWhitelisted: true })` global desde la Etapa 2 — un campo no
  declarado en el DTO (ej. mandar `tenantId` a mano) rechaza la request
  ENTERA con 400, no lo descarta en silencio. Verificado con un test
  nuevo.
- **SQL injection**: única query cruda en todo el código de producción es
  `SELECT 1` (tagged template `$queryRaw`, sin interpolación) en
  `HealthController` — todo lo demás pasa por el query builder de Prisma
  (parametrizado). Sin superficie de inyección.
- **Secretos nunca devueltos**: `SAFE_SELECT` en `IntegrationsService`
  (Etapas 15-17), credenciales cifradas en reposo
  (`TENANT_SECRETS_ENCRYPTION_KEY`), sin cambios necesarios.
- **Errores nunca filtran detalle técnico**: `AllExceptionsFilter`
  (desde la Etapa 2) siempre devuelve un mensaje genérico en un 500,
  logueando el detalle real solo del lado del servidor con un `errorId`
  correlacionable. Verificado con un test nuevo (ningún patrón de stack
  trace en el body de una respuesta de error).
- **Rate limiting**: ya implementado desde la Etapa 3
  (`@nestjs/throttler`, global + límites puntuales más estrictos en
  login/register/reservas públicas) — sin cambios en esta etapa.

## 5. Qué NO se hizo en esta etapa (a propósito)

- **`FORCE ROW LEVEL SECURITY`**: requiere un rol de Postgres separado,
  de menor privilegio, dedicado a las queries tenant-scoped — cambio de
  infraestructura de conexión (nuevo `DATABASE_URL` restringido, nueva
  gestión de credenciales) fuera del alcance de esta etapa, ver §2.
- **Wireo de `SET LOCAL app.tenant_id` end-to-end en `TenantPrismaService`**:
  descartado tras confirmar el choque con transacciones interactivas
  (§2, punto 2) — implementarlo mal habría arriesgado la integridad
  transaccional de Ventas/Caja/Compras, un riesgo peor que no tener RLS
  activo todavía.
- **Rol de Postgres restringido + reconexión con `BYPASSRLS=false`**:
  el paso que sí activaría RLS de verdad — explícitamente diferido, no
  es una tarea de una sola línea de código sino una decisión de
  infraestructura (aprovisionamiento de un rol nuevo, posible impacto en
  el pool de conexiones).
- **Pentest externo/automatizado** (herramientas tipo OWASP ZAP,
  Burp Suite): "pentest interno" en el sentido del pedido — verificación
  manual y por tests del propio equipo contra el checklist del doc 04,
  no una auditoría de terceros.

## 6. Tests

`test/security-hardening.spec.ts` (8 tests, nuevos): JWT con firma
manipulada, JWT expirado, JWT bien firmado de un usuario/tenant
inexistente — los tres rechazados con 401; referencias explícitas a la
cobertura ya existente de aislamiento multi-tenant y RBAC; cabeceras de
`helmet` presentes y `X-Powered-By` ausente; mass assignment rechazado
(400); ningún 500 filtra detalle técnico. 210 tests en la suite completa
(8 nuevos) — la migración de RLS en sí no agrega tests propios (es
inerte por diseño, verificado corriendo la suite completa sin cambios
antes/después de aplicarla).
