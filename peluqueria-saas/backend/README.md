# Backend — Prompt Maestro SaaS (Etapas 2 a 7)

NestJS + Prisma + PostgreSQL. Implementa Autenticación, Usuarios, RBAC y el
mecanismo de aislamiento multi-tenant (Etapa 2), el panel de SUPER ADMIN
completamente separado del de negocio (Etapa 3), Planes + Feature Flags con
límites de plan aplicados de verdad (Etapa 4), Suscripciones + Mercado
Pago — billing real de la plataforma (Etapa 5), Clientes/CRM (Etapa 6) y
Profesionales (Etapa 7). Ver `../docs/` para el diseño completo
(arquitectura, base de datos, seguridad, roadmap).

## Requisitos

- Node.js 20+
- PostgreSQL 14+ corriendo localmente (o accesible por `DATABASE_URL`)

## Setup

```bash
npm install
cp .env.example .env   # completar DATABASE_URL, los JWT_*_SECRET y el bootstrap de SUPER ADMIN
npm run prisma:migrate # aplica las migraciones (crea las tablas)
npm run prisma:seed    # carga el catálogo de permisos, los roles de sistema,
                        # crea el primer PlatformAdmin (SUPER_ADMIN_BOOTSTRAP_*)
                        # y siembra planes/feature flags de ejemplo

# Completar además MERCADO_PAGO_ACCESS_TOKEN / MERCADO_PAGO_WEBHOOK_SECRET /
# APP_PUBLIC_URL si vas a probar checkout/webhooks (Etapa 5) — con
# credenciales de TEST (public/access token que empiezan con TEST-) alcanza.
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

## Flujo mínimo de prueba manual — Planes y Feature Flags

```bash
# 1) Asignarle el plan Premium (sembrado por el seed) a un negocio existente
curl -X PATCH http://localhost:3000/api/v1/platform-admin/tenants/<tenantId>/plan \
  -H "Authorization: Bearer <accessToken de SUPER ADMIN>" \
  -H "Content-Type: application/json" \
  -d '{"planId":"<idDelPlanPremium>"}'

# 2) El negocio ve qué módulos tiene disponibles
curl http://localhost:3000/api/v1/feature-flags \
  -H "Authorization: Bearer <accessToken del negocio>"

# 3) El negocio activa uno (solo funciona si "available":true)
curl -X PATCH http://localhost:3000/api/v1/feature-flags/points \
  -H "Authorization: Bearer <accessToken del negocio>" \
  -H "Content-Type: application/json" \
  -d '{"enabled":true}'

# 4) Ver plan actual + uso vs. límites
curl http://localhost:3000/api/v1/plan \
  -H "Authorization: Bearer <accessToken del negocio>"
```

## Flujo mínimo de prueba manual — Clientes (CRM)

```bash
# 1) Crear un cliente (no exige email/teléfono único, a diferencia de User)
curl -X POST http://localhost:3000/api/v1/clients \
  -H "Authorization: Bearer <accessToken del negocio>" \
  -H "Content-Type: application/json" \
  -d '{"firstName":"Marta","lastName":"López","phone":"1122334455"}'

# 2) Ver la ficha completa (datos + notas + placeholder de historial)
curl http://localhost:3000/api/v1/clients/<clientId> \
  -H "Authorization: Bearer <accessToken del negocio>"

# 3) Agregar una nota interna
curl -X POST http://localhost:3000/api/v1/clients/<clientId>/notes \
  -H "Authorization: Bearer <accessToken del negocio>" \
  -H "Content-Type: application/json" \
  -d '{"body":"Prefiere turnos por la tarde."}'

# 4) Baja (soft delete — el historial se conserva)
curl -X DELETE http://localhost:3000/api/v1/clients/<clientId> \
  -H "Authorization: Bearer <accessToken del negocio>"
```

## Flujo mínimo de prueba manual — Profesionales

```bash
# 1) Crear un profesional (especialidades como tags, comisión opcional)
curl -X POST http://localhost:3000/api/v1/professionals \
  -H "Authorization: Bearer <accessToken del negocio>" \
  -H "Content-Type: application/json" \
  -d '{"firstName":"Carla","lastName":"Ruiz","specialties":["corte","color"],"commissionPercentage":15}'

# 2) Definir su horario semanal (reemplaza el horario completo)
curl -X PUT http://localhost:3000/api/v1/professionals/<professionalId>/schedule \
  -H "Authorization: Bearer <accessToken del negocio>" \
  -H "Content-Type: application/json" \
  -d '{"entries":[{"dayOfWeek":1,"startTime":"09:00","endTime":"18:00"}]}'

# 3) Ver la ficha completa (datos + horario)
curl http://localhost:3000/api/v1/professionals/<professionalId> \
  -H "Authorization: Bearer <accessToken del negocio>"
```

## Flujo mínimo de prueba manual — Suscripciones y Mercado Pago

```bash
# 1) Elegir un plan (arranca un trial de 14 días y sincroniza Tenant.planId)
curl -X POST http://localhost:3000/api/v1/subscription/select-plan \
  -H "Authorization: Bearer <accessToken del negocio>" \
  -H "Content-Type: application/json" \
  -d '{"planId":"<idDeUnPlan>"}'

# 2) Generar el checkout (requiere MERCADO_PAGO_ACCESS_TOKEN configurado
#    con credenciales de TEST — devuelve una URL real de Mercado Pago)
curl -X POST http://localhost:3000/api/v1/subscription/checkout \
  -H "Authorization: Bearer <accessToken del negocio>"

# 3) Ver estado de la suscripción (días restantes calculados en el servidor)
curl http://localhost:3000/api/v1/subscription \
  -H "Authorization: Bearer <accessToken del negocio>"

# 4) El webhook (POST /webhooks/mercado-pago) lo llama Mercado Pago, no se
#    prueba a mano salvo con el simulador de webhooks del dashboard (que sí
#    firma las notificaciones con el secreto configurado).
```

## Estructura

```
src/
├── auth/                     # login, refresh, register-tenant, JWT strategy, guards (negocio)
├── prisma/                   # PrismaService (crudo) + TenantPrismaService (tenant-scoped)
├── users/                     # CRUD de usuarios (tenant-scoped, soft delete, PlanLimitsGuard)
├── roles/                      # CRUD de roles (sistema + propios del negocio)
├── permissions/                 # catálogo global de permisos (solo lectura)
├── branches/                     # CRUD de sucursales (PlanLimitsGuard)
├── clients/                        # CRUD de clientes (CRM), notas internas, ficha (PlanLimitsGuard)
├── professionals/                   # CRUD de profesionales, horario semanal propio, vínculo a User
├── support/                       # tickets de soporte, lado negocio (tenant-scoped)
├── feature-flags/                  # FeatureFlagsService (jerarquía) + FeatureFlagGuard, lado negocio
├── plan-limits/                     # PlanLimitsService + PlanLimitsGuard (límites de plan)
├── plan-info/                        # GET /plan — plan actual + uso vs. límites
├── mercado-pago/                      # MercadoPagoService encapsulado (única integración con la API real)
├── subscriptions/                      # elegir plan, checkout, estado de la suscripción (lado negocio)
├── webhooks/mercado-pago/               # recibe y procesa notificaciones de pago (público, firma validada)
├── platform-admin/                       # todo lo de SUPER ADMIN — dominio de auth separado
│   ├── auth/                              # login+MFA en 2 pasos, JWT/estrategia propios
│   ├── tenants/                            # alta/búsqueda/suspender/reactivar/cancelar/asignar plan
│   ├── audit/                               # lectura de auditoría global
│   ├── support/                              # tickets de soporte, lado SUPER ADMIN (todos los tenants)
│   ├── communications/                        # comunicaciones globales (todos/plan/negocios puntuales)
│   ├── plans/                                  # CRUD de planes + asociación de feature flags
│   ├── feature-flags/                           # catálogo global de feature flags
│   └── subscriptions/                            # ver suscripciones/vencimientos de todos los negocios
├── common/filters/                                 # manejo de errores (nunca se expone detalle técnico)
└── app.module.ts                                    # wiring de guards globales + throttler

prisma/
├── schema.prisma    # modelo de datos (fundacional + auth + SUPER ADMIN + planes/flags + suscripciones)
├── migrations/       # historial versionado del schema (nunca a mano en prod)
└── seed.ts             # permisos + roles de sistema + bootstrap de SUPER ADMIN + planes/flags de ejemplo

test/
├── auth.spec.ts                        # registro, login, refresh con rotación, logout (negocio)
├── tenant-isolation.spec.ts              # el test más importante: Tenant A vs Tenant B
├── permissions.spec.ts                    # RBAC: permisos requeridos, efecto inmediato
├── platform-admin-auth.spec.ts             # MFA obligatorio, lockout, separación de dominios
├── platform-admin-tenants.spec.ts           # CRUD de negocios, efecto inmediato de suspender
├── support.spec.ts                           # aislamiento de tickets entre tenants
├── platform-admin-communications.spec.ts       # 3 tipos de audiencia + validaciones
├── feature-flags.spec.ts                        # jerarquía SUPER ADMIN → Plan → Negocio completa
├── plan-limits.spec.ts                           # límites de plan aplicados de verdad
├── subscriptions.spec.ts                          # checkout mockeado, firma de webhook, idempotencia
├── clients.spec.ts                                 # CRUD, notas internas, aislamiento, límite de plan
├── professionals.spec.ts                           # CRUD, horario, vínculo a User, aislamiento, límite de plan
└── helpers/platform-admin.ts                       # helper compartido: crear+loguear un SUPER ADMIN
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
