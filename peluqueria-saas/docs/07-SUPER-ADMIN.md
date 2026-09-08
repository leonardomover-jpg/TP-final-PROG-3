# 07 — SUPER ADMIN (Etapa 3)

## 1. Qué problema resuelve

Le da a la plataforma un dueño operativo: alguien que puede ver y controlar
todos los negocios, sin ser parte de ninguno. Es la pieza que hace que esto
sea un SaaS (un producto que vos operás para muchos clientes) y no 47
instalaciones sueltas del mismo software.

## 2. Dependencias

Depende de: Tenant, AuditLog, Plan (doc `02`/`03`, ya diseñados en Etapa 1).
Es requisito de: toda operación administrativa de plataforma en etapas
futuras (gestión de planes/feature flags desde UI, billing de suscripciones,
soporte avanzado).

## 3. Por qué dos paneles completamente separados (punto 7 del pedido)

Un `PlatformAdmin` **no es** una fila de `User` con un rol especial. Es una
tabla distinta, con su propio flujo de login, su propio secreto JWT
(`PLATFORM_ADMIN_JWT_ACCESS_SECRET` / `..._REFRESH_SECRET`, ambos distintos
de los de negocio) y su propia estrategia passport (`'platform-admin-jwt'`,
no `'jwt'`). Un token de negocio JAMÁS puede pasar el guard de SUPER ADMIN,
y viceversa — no por convención, sino porque la firma no matchea contra el
secreto del otro dominio. Se agregó un test específico para esto
(`test/platform-admin-auth.spec.ts`, "un endpoint de negocio no acepta un
token de SUPER ADMIN, y viceversa").

Las rutas de SUPER ADMIN viven bajo el prefijo `/api/v1/platform-admin/*` y
se marcan `@Public()` respecto del `JwtAuthGuard` GLOBAL de negocio (que de
otra forma las interceptaría exigiendo un JWT de tenant) — la autenticación
real la exige `PlatformAdminJwtAuthGuard`, aplicado explícitamente en cada
controller de `platform-admin/*` vía `@UseGuards(...)`, nunca de forma
global. Dos guards, dos dominios, cero superposición.

## 4. MFA obligatorio (punto 8 del pedido)

No existe ningún camino en el código que devuelva un access token de SUPER
ADMIN sin haber verificado un código TOTP. El login es siempre en dos pasos:

```
POST /platform-admin/auth/login (email + password)
  │
  ├─ mfaEnabled = false (primera vez) → genera secreto TOTP, devuelve
  │  { mfaSetupRequired, mfaChallengeToken, otpauthUrl, secret }
  │  (el secreto se muestra UNA vez, para cargarlo en Google
  │  Authenticator/Authy — la cuenta todavía no está protegida, es
  │  literalmente el paso de enrolamiento)
  │
  └─ mfaEnabled = true → devuelve { mfaRequired, mfaChallengeToken }
     (nunca el secreto de nuevo)

POST /platform-admin/auth/mfa/verify (mfaChallengeToken + code de 6 dígitos)
  → confirma el enrolamiento la primera vez (mfaEnabled=true) y siempre
    devuelve accessToken + refreshToken recién acá.
```

El `mfaChallengeToken` es un JWT con `purpose: 'mfa_challenge'` (vs.
`purpose: 'access'` de un token real). `PlatformAdminJwtStrategy` rechaza
cualquier token cuyo `purpose` no sea `'access'`, así que un
`mfaChallengeToken` filtrado no sirve para nada aunque esté correctamente
firmado — no probó el segundo factor.

## 5. Fuerza bruta y rate limiting (punto 62 del pedido)

Dos capas independientes, no una sola:

1. **Bloqueo de cuenta** (`PlatformAdmin.failedLoginAttempts` /
   `lockedUntil`): 5 intentos fallidos (de password o de código MFA)
   bloquean la cuenta 15 minutos, sin importar desde qué IP vengan.
2. **Rate limiting por IP** (`@nestjs/throttler`, global vía `ThrottlerGuard`
   + `@Throttle` más estricto en los endpoints de login/mfa-verify, tanto de
   negocio como de SUPER ADMIN): protege contra un atacante que rota de
   cuenta en cuenta.

## 6. Gestión de negocios

`PlatformAdminTenantsService` es, junto con el resto de `platform-admin/*`,
el ÚNICO lugar del backend donde está bien usar `PrismaService` crudo para
leer/escribir `Tenant` de múltiples negocios a la vez — es exactamente lo
que SUPER ADMIN necesita poder hacer. Ningún otro módulo debe replicar ese
patrón (ver comentario en el propio archivo).

- Listar con búsqueda (nombre/slug) y filtro por estado, paginado.
- Crear un negocio (con su sucursal principal y usuario admin) sin pasar
  por el flujo de auto-registro — es un alta administrativa, no un signup.
- Suspender / reactivar / cancelar, con auditoría en cada cambio.

**Efecto real de suspender/cancelar (no solo cosmético):**
`JwtStrategy.validate` (Etapa 2) ahora también revalida `tenant.status`, no
solo `user.status`. Si SUPER ADMIN suspende un negocio, cualquier usuario de
ese negocio pierde el acceso en su próximo request — incluso con un access
token ya emitido y todavía no vencido, no hace falta esperar los 15 minutos
de TTL. Se testea explícitamente en
`test/platform-admin-tenants.spec.ts`.

## 7. Auditoría global

`GET /platform-admin/audit-logs` expone (paginado, filtrable por
tenant/actor/acción) la misma tabla `AuditLog` diseñada en la Etapa 1 — no
hizo falta un modelo nuevo, el diseño fundacional ya contemplaba
`actorType: 'platform_admin'` y `tenantId` nulo para acciones de plataforma.

## 8. Soporte (punto 59 del pedido)

- **Lado negocio** (`src/support/`, tenant-scoped como cualquier otro
  módulo de negocio): crear ticket, listar los propios, ver el detalle,
  responder. Permisos nuevos: `soporte.ver`, `soporte.crear`.
- **Lado SUPER ADMIN** (`src/platform-admin/support/`): listar entre todos
  los negocios (filtrable por tenant/estado), cambiar estado/prioridad,
  asignar, responder.
- `SupportTicketMessage` no tiene `tenantId` propio — es una tabla puente
  como `UserBranch`/`RolePermission` (doc `02` §6.5): su aislamiento se
  garantiza validando el ticket padre con el cliente tenant-scoped antes de
  tocarla.

## 9. Comunicaciones globales (punto 60 del pedido)

Solo se implementó **creación + listado** del lado SUPER ADMIN en esta
etapa. El **consumo** (que un usuario del negocio vea la comunicación en su
propio centro de notificaciones) queda para la Etapa 14 (Notificaciones) del
roadmap — ahí es donde corresponde el "centro de notificaciones" completo
del punto 58 del pedido, y esta etapa ya deja el modelo de datos y quién
puede emitir qué (`all` | `plan` | `tenants` específicos) resuelto y
validado.

## 10. Qué NO se hizo en esta etapa (a propósito)

- Roles/permisos diferenciados **entre** SUPER ADMINs (por ahora cualquier
  `PlatformAdmin` autenticado puede todo). El pedido describe a SUPER ADMIN
  como "el administrador global", no una jerarquía de administradores de
  plataforma — si en el futuro se necesita eso, se agrega un RBAC análogo al
  de negocio (doc `02` §6.4) sin romper nada de lo ya construido.
- Adjuntar archivos a tickets de soporte ("adjuntar información", punto 59):
  depende del módulo de Almacenamiento (transversal, todavía no construido).
- Gestión de Planes/Feature Flags desde el panel de SUPER ADMIN (crear/
  editar planes, prender flags globales): el modelo de datos ya existe
  desde la Etapa 1 (doc `03`); los endpoints de gestión se agregan en la
  Etapa 4 del roadmap, junto con `PlanLimitsGuard`/`FeatureFlagGuard`.

## 11. Tests

`test/platform-admin-auth.spec.ts`, `test/platform-admin-tenants.spec.ts`,
`test/support.spec.ts`, `test/platform-admin-communications.spec.ts` — 39
tests en total en la suite completa (Etapa 2 + 3), todos contra PostgreSQL
real. Cubren: enrolamiento y verificación de MFA, rechazo de código
incorrecto, bloqueo por intentos fallidos, separación total entre los dos
dominios de token, alta/búsqueda/suspensión/reactivación/cancelación de
negocios con efecto inmediato sobre sesiones activas, aislamiento de
tickets de soporte entre tenants, y las 3 variantes de audiencia de
comunicaciones con sus validaciones.
