# Backend — Prompt Maestro SaaS (Etapa 2)

NestJS + Prisma + PostgreSQL. Implementa Autenticación, Usuarios, RBAC y el
mecanismo de aislamiento multi-tenant. Ver `../docs/` para el diseño
completo (arquitectura, base de datos, seguridad, roadmap).

## Requisitos

- Node.js 20+
- PostgreSQL 14+ corriendo localmente (o accesible por `DATABASE_URL`)

## Setup

```bash
npm install
cp .env.example .env   # completar DATABASE_URL y los JWT_*_SECRET
npm run prisma:migrate # aplica las migraciones (crea las tablas)
npm run prisma:seed    # carga el catálogo de permisos y los roles de sistema
```

## Correr

```bash
npm run start:dev   # servidor en http://localhost:3000/api/v1
```

## Tests

Los tests corren contra una base PostgreSQL real (no hay mocks de Prisma) —
apuntan a la misma `DATABASE_URL` del `.env`. Incluyen el test de
aislamiento multi-tenant más importante del sistema (`test/tenant-isolation.spec.ts`):
"Tenant A no puede leer/editar/eliminar nada de Tenant B, ni por ID directo".

```bash
npm test
```

## Flujo mínimo de prueba manual

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

## Estructura

```
src/
├── auth/            # login, refresh, register-tenant, JWT strategy, guards
├── prisma/          # PrismaService (crudo) + TenantPrismaService (tenant-scoped)
├── users/            # CRUD de usuarios (tenant-scoped, soft delete)
├── roles/             # CRUD de roles (sistema + propios del negocio)
├── permissions/        # catálogo global de permisos (solo lectura)
├── branches/            # CRUD de sucursales
├── common/filters/       # manejo de errores (nunca se expone detalle técnico)
└── app.module.ts          # wiring de guards globales (JWT + permisos)

prisma/
├── schema.prisma    # modelo de datos (fundacional + auth)
├── migrations/       # historial versionado del schema (nunca a mano en prod)
└── seed.ts             # catálogo de permisos + roles de sistema

test/
├── auth.spec.ts             # registro, login, refresh con rotación, logout
├── tenant-isolation.spec.ts  # el test más importante: Tenant A vs Tenant B
└── permissions.spec.ts        # RBAC: permisos requeridos, efecto inmediato
```

## Por qué el aislamiento multi-tenant es "imposible de olvidar"

Ningún service escribe `WHERE tenantId = ...` a mano. Los services de
negocio inyectan `TenantPrismaService` (nunca `PrismaService` crudo), que
expone un cliente Prisma extendido (`Prisma Client Extension`) donde el
`tenant_id` del usuario autenticado se inyecta automáticamente en cada
find/update/delete/create sobre un modelo tenant-scoped. El diseño completo
está en `../docs/02-MULTI-TENANCY-Y-BASE-DE-DATOS.md`.
