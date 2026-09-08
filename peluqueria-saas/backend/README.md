# Backend — Prompt Maestro SaaS (Etapas 2 y 3)

NestJS + Prisma + PostgreSQL. Implementa Autenticación, Usuarios, RBAC y el
mecanismo de aislamiento multi-tenant (Etapa 2), más el panel de SUPER ADMIN
completamente separado del de negocio (Etapa 3). Ver `../docs/` para el
diseño completo (arquitectura, base de datos, seguridad, roadmap).

## Requisitos

- Node.js 20+
- PostgreSQL 14+ corriendo localmente (o accesible por `DATABASE_URL`)

## Setup

```bash
npm install
cp .env.example .env   # completar DATABASE_URL, los JWT_*_SECRET y el bootstrap de SUPER ADMIN
npm run prisma:migrate # aplica las migraciones (crea las tablas)
npm run prisma:seed    # carga el catálogo de permisos, los roles de sistema
                        # y crea el primer PlatformAdmin (SUPER_ADMIN_BOOTSTRAP_*)
```

## Correr

```bash
npm run start:dev   # servidor en http://localhost:3000/api/v1
```

## Tests

Los tests corren contra una base PostgreSQL real (no hay mocks de Prisma) —
apuntan a la misma `DATABASE_URL` del `.env`. Incluyen el test de
aislamiento multi-tenant más importante del sistema (`test/tenant-isolation.spec.ts`):
"Tenant A no puede leer/editar/eliminar nada de Tenant B, ni por ID directo",
y el de separación total de dominios de auth (`test/platform-admin-auth.spec.ts`):
"un token de negocio no sirve en el panel de SUPER ADMIN, ni viceversa".

```bash
npm test
```

## Flujo mínimo de prueba manual — negocio

```bash
# 1) Registrar un negocio (crea tenant + sucursal principal + admin)
curl -X POST http://localhost:3000/api/v1/auth/register-tenant \
  -H "Content-Type: application/json" \
  -d '{
    "businessName": "Barbería Demo",
    "slug": "barberia-demo",
    "firstName": "Ana",
    "lastName": "Gómez",
    "email": "admin@demo.com",
    "password": "SuperSecreta123!"
  }'

# 2) Login (guardar el accessToken de la respuesta)
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"tenantSlug":"barberia-demo","email":"admin@demo.com","password":"SuperSecreta123!"}'

# 3) Usar el token en cualquier endpoint protegido
curl http://localhost:3000/api/v1/users \
  -H "Authorization: Bearer <accessToken>"
```

## Flujo mínimo de prueba manual — SUPER ADMIN (MFA obligatorio)

```bash
# 1) Login con el SUPER ADMIN creado por el seed (SUPER_ADMIN_BOOTSTRAP_*)
curl -X POST http://localhost:3000/api/v1/platform-admin/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@tu-plataforma.com","password":"..."}'
# -> primera vez: { mfaSetupRequired: true, mfaChallengeToken, otpauthUrl, secret }
#    cargar "secret" u "otpauthUrl" en Google Authenticator/Authy

# 2) Confirmar el código de 6 dígitos (recién acá se obtienen los tokens reales)
curl -X POST http://localhost:3000/api/v1/platform-admin/auth/mfa/verify \
  -H "Content-Type: application/json" \
  -d '{"mfaChallengeToken":"<el del paso 1>","code":"123456"}'

# 3) Gestionar negocios
curl http://localhost:3000/api/v1/platform-admin/tenants \
  -H "Authorization: Bearer <accessToken de SUPER ADMIN>"
```

## Estructura

```
src/
├── auth/                     # login, refresh, register-tenant, JWT strategy, guards (negocio)
├── prisma/                   # PrismaService (crudo) + TenantPrismaService (tenant-scoped)
├── users/                     # CRUD de usuarios (tenant-scoped, soft delete)
├── roles/                      # CRUD de roles (sistema + propios del negocio)
├── permissions/                 # catálogo global de permisos (solo lectura)
├── branches/                     # CRUD de sucursales
├── support/                       # tickets de soporte, lado negocio (tenant-scoped)
├── platform-admin/                 # todo lo de SUPER ADMIN — dominio de auth separado
│   ├── auth/                        # login+MFA en 2 pasos, JWT/estrategia propios
│   ├── tenants/                      # alta/búsqueda/suspender/reactivar/cancelar negocios
│   ├── audit/                         # lectura de auditoría global
│   ├── support/                        # tickets de soporte, lado SUPER ADMIN (todos los tenants)
│   └── communications/                  # comunicaciones globales (todos/plan/negocios puntuales)
├── common/filters/                       # manejo de errores (nunca se expone detalle técnico)
└── app.module.ts                          # wiring de guards globales + throttler

prisma/
├── schema.prisma    # modelo de datos (fundacional + auth + SUPER ADMIN)
├── migrations/       # historial versionado del schema (nunca a mano en prod)
└── seed.ts             # catálogo de permisos + roles de sistema + bootstrap de SUPER ADMIN

test/
├── auth.spec.ts                        # registro, login, refresh con rotación, logout (negocio)
├── tenant-isolation.spec.ts              # el test más importante: Tenant A vs Tenant B
├── permissions.spec.ts                    # RBAC: permisos requeridos, efecto inmediato
├── platform-admin-auth.spec.ts             # MFA obligatorio, lockout, separación de dominios
├── platform-admin-tenants.spec.ts           # CRUD de negocios, efecto inmediato de suspender
├── support.spec.ts                           # aislamiento de tickets entre tenants
├── platform-admin-communications.spec.ts       # 3 tipos de audiencia + validaciones
└── helpers/platform-admin.ts                    # helper compartido: crear+loguear un SUPER ADMIN
```

## Por qué el aislamiento multi-tenant es "imposible de olvidar"

Ningún service escribe `WHERE tenantId = ...` a mano. Los services de
negocio inyectan `TenantPrismaService` (nunca `PrismaService` crudo), que
expone un cliente Prisma extendido (`Prisma Client Extension`) donde el
`tenant_id` del usuario autenticado se inyecta automáticamente en cada
find/update/delete/create sobre un modelo tenant-scoped. El diseño completo
está en `../docs/02-MULTI-TENANCY-Y-BASE-DE-DATOS.md`.

`platform-admin/*` es la única excepción deliberada: ahí se usa
`PrismaService` crudo a propósito, porque SUPER ADMIN necesita leer/escribir
across todos los negocios. Ver `../docs/07-SUPER-ADMIN.md`.

## Por qué el panel de SUPER ADMIN es un dominio de auth aparte

`PlatformAdmin` no es un `User` con un rol especial: es otra tabla, con sus
propios secretos JWT (`PLATFORM_ADMIN_JWT_*_SECRET`, distintos de
`JWT_*_SECRET`) y su propia estrategia passport. Un token de un panel nunca
sirve en el otro — no por convención, sino porque la firma no matchea.
Además, todo login de SUPER ADMIN exige MFA (TOTP) en dos pasos: el primer
paso nunca devuelve un access token real. Detalle completo en
`../docs/07-SUPER-ADMIN.md`.
