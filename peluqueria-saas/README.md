# Prompt Maestro — SaaS para Peluquerías, Barberías y Salones

Plataforma SaaS multi-tenant para gestión integral de peluquerías, barberías y
salones de belleza (agenda, clientes, ventas, inventario, fidelización,
WhatsApp/Meta, Mercado Pago, panel SUPER ADMIN, etc.).

Este directorio es un **proyecto nuevo e independiente** del Stock Manager
(TIF de PROG-3) que vive en `../backend` y `../frontend` en la raíz del
repositorio — no comparten código, base de datos ni dependencias.

## Estado actual

- ✅ **Etapa 1 — Análisis y Arquitectura**: módulos, dependencias,
  arquitectura, stack, estrategia multi-tenant, schema fundacional, seguridad
  baseline, riesgos detectados.
- ✅ **Etapa 2 — Autenticación + Usuarios + RBAC + Multi-tenancy (código real)**:
  backend NestJS + Prisma funcionando de punta a punta, incluyendo el test
  más crítico del sistema: **Tenant A no puede leer/editar/eliminar nada de
  Tenant B**, ni siquiera por ID directo (IDOR).
- ✅ **Etapa 3 — SUPER ADMIN (panel y API separados)**: dominio de auth
  totalmente distinto del de negocio, con MFA (TOTP) obligatorio, gestión de
  negocios (alta/búsqueda/suspender/reactivar/cancelar), auditoría global,
  soporte y comunicaciones globales.
- ✅ **Etapa 4 — Planes y Feature Flags (código real)**: jerarquía SUPER
  ADMIN → Plan → Negocio resuelta en un único service, límites de plan
  aplicados de verdad al crear usuarios/sucursales, gestión de planes/flags
  desde SUPER ADMIN.
- ✅ **Etapa 5 — Suscripciones + Mercado Pago**: checkout real (Checkout
  Pro), webhook con firma HMAC-SHA256 validada e idempotencia real por
  constraint único, trial de 14 días, vencimiento calculado siempre con la
  fecha del servidor.

53 tests automatizados pasando contra PostgreSQL real (`backend/test/`).

Implementado en Etapa 2:

- Registro de negocio (`POST /auth/register-tenant`): crea tenant, sucursal
  principal y usuario admin en una transacción.
- Login por tenant + email + password (Argon2id), JWT access (15 min) +
  refresh (7 días) con **rotación y revocación real** (tabla `RefreshToken`).
- Aislamiento multi-tenant en la capa de datos: `TenantPrismaService`
  (Prisma Client Extension) filtra automáticamente por `tenant_id` en todo
  find/update/delete/create — ningún service arma ese filtro a mano.
- RBAC completo: catálogo de permisos, roles de sistema (Administrador,
  Recepcionista, Profesional) + roles propios por negocio, `PermissionsGuard`
  que resuelve permisos frescos en cada request (un cambio de rol aplica sin
  esperar a que expire el token).
- CRUD de Usuarios, Roles y Sucursales, todo tenant-scoped y con soft delete.
- Seed idempotente de permisos y roles de sistema (`npm run prisma:seed`).

Implementado en Etapa 3 (detalle completo en
[`docs/07-SUPER-ADMIN.md`](docs/07-SUPER-ADMIN.md)):

- `PlatformAdmin`: secretos JWT y estrategia passport propios, MFA (TOTP)
  obligatorio en dos pasos, bloqueo de cuenta tras 5 intentos fallidos, rate
  limiting global (`@nestjs/throttler`) — un token de negocio y uno de SUPER
  ADMIN nunca sirven en el panel del otro.
- Gestión de negocios: alta administrativa (sin autoregistro), búsqueda/
  filtro paginado, suspender/reactivar/cancelar con **efecto inmediato**
  sobre sesiones ya activas de ese negocio.
- Auditoría global paginada (misma tabla `AuditLog` de la Etapa 1).
- Soporte: tickets tenant-scoped del lado negocio, visibles entre todos los
  negocios del lado SUPER ADMIN (asignar/responder/cambiar estado).
- Comunicaciones globales: creación + listado, con 3 tipos de audiencia
  (todos / un plan / negocios puntuales) — el consumo del lado negocio
  queda para la Etapa 14 (Notificaciones).

Implementado en Etapa 4 (detalle completo en
[`docs/08-PLANES-Y-FEATURE-FLAGS-CODIGO.md`](docs/08-PLANES-Y-FEATURE-FLAGS-CODIGO.md)),
sin ninguna migración nueva — el modelo ya estaba diseñado desde la Etapa 1:

- `FeatureFlagsService`: único lugar que resuelve si un negocio puede usar
  un módulo (global habilitado + incluido en el plan + prendido por el
  propio negocio), con el motivo exacto cuando no puede.
- `FeatureFlagGuard`/`@RequiresFeature`: infraestructura lista para que los
  módulos opcionales de etapas siguientes (Puntos, Gift Cards, WhatsApp...)
  se gateen sin repetir lógica.
- `PlanLimitsGuard`/`@LimitResource`: límites de plan aplicados de verdad —
  ya conectado a la creación de usuarios y sucursales, con mensaje claro al
  llegar al tope.
- SUPER ADMIN gestiona el catálogo de planes y feature flags en runtime
  (`platform-admin/plans`, `platform-admin/feature-flags`), incluida la
  asignación de plan a un negocio existente.
- El propio negocio ve y prende/apaga sus módulos disponibles
  (`GET`/`PATCH /feature-flags`) y su plan + uso actual (`GET /plan`).

Implementado en Etapa 5 (detalle completo en
[`docs/09-SUSCRIPCIONES-MERCADO-PAGO.md`](docs/09-SUSCRIPCIONES-MERCADO-PAGO.md)):

- `MercadoPagoService` encapsulado (única cuenta, la de la plataforma —
  cobra la suscripción SaaS a cada negocio, no confundir con pagos de
  clientes de la Etapa 15) — forma del endpoint y del algoritmo de firma
  verificados contra documentación oficial, no inventados.
- Elegir/cambiar de plan arranca un trial de 14 días y sincroniza
  `Tenant.planId` con la suscripción (para que Feature Flags/límites de
  plan de la Etapa 4 vean siempre el plan vigente).
- Checkout real vía Checkout Pro; el comprador nunca ingresa datos de
  tarjeta en el dominio propio.
- Webhook con validación de firma (rechaza notificaciones falsas) e
  idempotencia real por constraint único — una notificación reenviada
  nunca duplica un pago ni extiende el período dos veces.
- `GET /subscription` calcula días restantes y "por vencer" siempre con la
  fecha del servidor, nunca la del cliente.
- SUPER ADMIN ve el estado de las suscripciones de todos los negocios.

Ver instrucciones para correrlo en [`backend/README.md`](backend/README.md).

El resto de los módulos de negocio (clientes, turnos, ventas, inventario,
etc.) se implementan en las etapas siguientes, en el orden definido en
[`docs/06-ROADMAP-ETAPAS.md`](docs/06-ROADMAP-ETAPAS.md).

## Documentos

| Doc | Contenido |
|---|---|
| [`docs/01-ANALISIS-Y-ARQUITECTURA.md`](docs/01-ANALISIS-Y-ARQUITECTURA.md) | Módulos, dependencias entre módulos, arquitectura general, stack tecnológico y justificación |
| [`docs/02-MULTI-TENANCY-Y-BASE-DE-DATOS.md`](docs/02-MULTI-TENANCY-Y-BASE-DE-DATOS.md) | Estrategia de aislamiento por tenant y diseño de las tablas fundacionales |
| [`docs/03-PLANES-FEATURE-FLAGS-SUSCRIPCIONES.md`](docs/03-PLANES-FEATURE-FLAGS-SUSCRIPCIONES.md) | Jerarquía SUPER ADMIN → Plan → Negocio, modelo de datos de planes/flags/suscripciones |
| [`docs/04-SEGURIDAD-BASELINE.md`](docs/04-SEGURIDAD-BASELINE.md) | Principios de seguridad transversales que todo módulo futuro debe cumplir |
| [`docs/05-OBSERVACIONES-Y-RIESGOS.md`](docs/05-OBSERVACIONES-Y-RIESGOS.md) | Funcionalidades/decisiones no explícitas en el pedido original, señaladas antes de implementar |
| [`docs/06-ROADMAP-ETAPAS.md`](docs/06-ROADMAP-ETAPAS.md) | Orden de las próximas etapas y checklist de revisión por etapa |
| [`docs/07-SUPER-ADMIN.md`](docs/07-SUPER-ADMIN.md) | Etapa 3: separación de dominios de auth, MFA obligatorio, gestión de negocios, soporte, comunicaciones |
| [`docs/08-PLANES-Y-FEATURE-FLAGS-CODIGO.md`](docs/08-PLANES-Y-FEATURE-FLAGS-CODIGO.md) | Etapa 4: FeatureFlagsService, FeatureFlagGuard, PlanLimitsGuard, gestión de planes/flags |
| [`docs/09-SUSCRIPCIONES-MERCADO-PAGO.md`](docs/09-SUSCRIPCIONES-MERCADO-PAGO.md) | Etapa 5: MercadoPagoService, checkout, webhook idempotente, trial, vencimientos |

## Stack propuesto (justificado en `01-ANALISIS-Y-ARQUITECTURA.md`)

- **Backend:** Node.js 20+ · TypeScript · NestJS (módulos, guards e
  interceptors nativos para RBAC, tenancy y feature flags)
- **Base de datos:** PostgreSQL · Prisma ORM · migraciones versionadas
- **Multi-tenancy:** base compartida + `tenant_id` + enforcement en backend
  (nunca solo en frontend), con RLS de Postgres como capa adicional
- **Jobs/colas:** Redis + BullMQ
- **Frontend:** React 18 · TypeScript · Vite · Tailwind · PWA
- **Pagos:** Mercado Pago (SDK oficial, webhooks, idempotencia)
- **Mensajería:** WhatsApp Business Platform / Meta Graph API (oficial)

## Próximo paso

Continuar con la Etapa 6 del roadmap: Clientes (CRM) — el primer módulo de
negocio "de verdad" (turnos, ventas, etc. dependen de que exista Cliente),
según el detalle de `docs/06-ROADMAP-ETAPAS.md`.
