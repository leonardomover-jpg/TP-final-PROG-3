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
- ✅ **Etapa 6 — Clientes (CRM)**: primer módulo de negocio "de verdad" —
  CRUD completo tenant-scoped, notas internas con autor y fecha, ficha con
  placeholder de historial (Turnos/Ventas/Puntos se completan en etapas
  futuras), límite de plan por cantidad de clientes aplicado de verdad.
- ✅ **Etapa 7 — Profesionales**: CRUD completo tenant-scoped, especialidades
  (tags), comisión, horario semanal propio reemplazable, vínculo opcional
  1:1 a un usuario del sistema, límite de plan por cantidad de
  profesionales.
- ✅ **Etapa 8 — Servicios**: CRUD completo tenant-scoped, categoría (tag),
  duración/precio, profesionales habilitados por servicio (relación M:N
  real, reemplazable, valida pertenencia al tenant de ambos extremos).
- ✅ **Etapa 9 — Horarios**: horario semanal de la sucursal, excepciones
  puntuales (sucursal o profesional), catálogo global de feriados
  argentinos con override manual por negocio, y un endpoint de
  disponibilidad que combina las tres fuentes para responder "¿abierto tal
  día, y en qué horario?" — insumo directo de la Etapa 10 (Agenda).
- ✅ **Etapa 10 — Agenda y Turnos**: motor de disponibilidad real —
  reserva un turno solo si el profesional está habilitado para el
  servicio, el horario cae dentro de su disponibilidad real y no se
  superpone con otro turno activo. Estados del turno con transiciones
  validadas, lista de espera. Señas quedan para la Etapa 15 (Mercado Pago
  para clientes).
- ✅ **Etapa 11 — Productos e Inventario**: primer módulo opcional gateado
  de verdad por Feature Flags (`inventory`) — sin habilitarlo, 403 en todo
  el módulo. Productos con SKU único, ajuste de stock, alerta de stock
  mínimo, proveedores, y compras que solo tocan stock al recibirlas.
- ✅ **Etapa 12 — Ventas + Caja + Gastos + Comisiones**: ventas mixtas
  (servicios+productos) con precio siempre del catálogo, pagos
  combinados, descuento/reposición de stock transaccional, apertura/
  cierre de caja con arqueo real, gastos categorizados, comisiones
  calculadas sobre el subtotal de servicios de cada profesional.
- ✅ **Etapa 13 — Fidelización**: cuatro módulos opcionales independientes,
  cada uno detrás de su propio Feature Flag — Puntos (otorgar/canjear
  contra un ledger), Gift Cards (emisión con código propio o autogenerado,
  canje parcial, cierre automático al llegar a $0), Referidos (premia al
  referente al completar el referido), Promociones (catálogo con código
  único). Sin ningún hook automático desde Ventas todavía — ver
  `docs/17-FIDELIZACION.md` §6.
- ✅ **Etapa 14 — Notificaciones**: centro de notificaciones (buzón propio
  de cada usuario + consumo de las Comunicaciones globales de la Etapa 3,
  resueltas por audiencia en runtime) y dos avisos internos automáticos —
  stock bajo (al cruzar el mínimo, desde Productos y Ventas) y cercanía al
  límite del plan (75%/90%, sin duplicar avisos). Canales externos
  (WhatsApp, email) quedan para etapas futuras.
- ✅ **Etapa 15 — Mercado Pago para clientes**: cada negocio conecta su
  PROPIA cuenta de Mercado Pago (credenciales cifradas AES-256-GCM,
  validadas contra la API real antes de guardarse) para cobrar señas que
  confirman un turno — checkout hospedado por Mercado Pago, webhook por
  tenant idempotente. Pago de servicios/productos sin turno y
  reconciliación con Ventas quedan fuera hasta que exista una página
  pública (Etapa 18) desde dónde originarlos.
- ✅ **Etapa 16 — WhatsApp (Meta Cloud API)**: cada negocio conecta su
  PROPIA cuenta de WhatsApp Business (mismo cifrado que Mercado Pago).
  Confirmar/cancelar un turno avisa por WhatsApp de forma best-effort
  (nunca rompe el flujo si falla), recordatorio manual disponible (sin
  scheduler todavía), webhook por tenant recibe mensajes entrantes y avisa
  al staff por su centro de notificaciones. El flujo de reserva por chat
  queda deliberadamente diferido — ver `docs/20-WHATSAPP.md` §8.

147 tests automatizados pasando contra PostgreSQL real (`backend/test/`).

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

Implementado en Etapa 6 (detalle completo en
[`docs/10-CLIENTES.md`](docs/10-CLIENTES.md)):

- CRUD completo de clientes (`GET/POST/PATCH/DELETE /clients`), tenant-scoped
  igual que Usuarios/Sucursales, sin exigir unicidad de email/teléfono (a
  diferencia de `User`: un cliente no es una identidad de login).
- Ficha del cliente con notas internas (`ClientNote`: autor + fecha, historial
  completo) y un placeholder explícito de historial (turnos/ventas/puntos) que
  se completa a medida que existan esos módulos.
- Soft delete: el historial del cliente se conserva, no se pierde.
- Límite de plan por cantidad de clientes (`maxClients`) aplicado de verdad
  vía `PlanLimitsGuard` — el `switch` ya estaba preparado desde la Etapa 4.

Implementado en Etapa 7 (detalle completo en
[`docs/11-PROFESIONALES.md`](docs/11-PROFESIONALES.md)):

- CRUD completo de profesionales (`GET/POST/PATCH/DELETE /professionals`),
  tenant-scoped igual que Clientes/Usuarios/Sucursales.
- Especialidades como tags libres (el catálogo formal de "profesionales
  habilitados por servicio" es de la Etapa 8) y comisión configurable (% de
  configuración; el cálculo real sobre ventas es de la Etapa 12).
- Horario semanal propio (`PUT /professionals/:id/schedule`, reemplazo
  completo) — el motor de disponibilidad con excepciones y feriados
  argentinos es de la Etapa 9, que se apoya en esta misma tabla.
- Vínculo opcional 1:1 a un `User` del sistema: un profesional puede no
  tener login propio, y viceversa.
- Límite de plan por cantidad de profesionales (`maxProfessionals`)
  aplicado de verdad, usando un campo del schema que existía desde la
  Etapa 1 sin ningún endpoint que lo usara hasta ahora.

Implementado en Etapa 8 (detalle completo en
[`docs/12-SERVICIOS.md`](docs/12-SERVICIOS.md)):

- CRUD completo de servicios (`GET/POST/PATCH/DELETE /services`),
  tenant-scoped igual que Profesionales/Clientes/Usuarios/Sucursales.
- Categoría como tag libre (mismo criterio que las especialidades de
  Profesionales) y duración/precio.
- Profesionales habilitados por servicio: relación M:N real
  (`ServiceProfessional`), reemplazable por completo vía `PUT
  /services/:id/professionals`, que valida que tanto el servicio como cada
  profesional pertenezcan al mismo negocio antes de guardar.
- Sin límite de plan por cantidad de servicios a propósito: el modelo de
  planes no anticipó ese límite (no inventado sin un pedido concreto).

Implementado en Etapa 9 (detalle completo en
[`docs/13-HORARIOS.md`](docs/13-HORARIOS.md)):

- Horario semanal de la sucursal (`PUT /branches/:id/schedule`), mismo
  patrón que el horario propio de un profesional (Etapa 7).
- Excepciones puntuales (`schedule/exceptions`): cierre o horario distinto
  para una sucursal o un profesional en una fecha concreta.
- Catálogo global de feriados argentinos gestionado por SUPER ADMIN
  (`platform-admin/holidays`), con override manual por negocio — sin fila
  propia, un feriado es no laborable por default.
- `GET /schedule/availability`: combina excepción → feriado (con su
  override) → horario semanal, en ese orden, para responder si un día
  está abierto y en qué horario — el primer insumo real del motor de
  turnos de la Etapa 10.

Implementado en Etapa 10 (detalle completo en
[`docs/14-AGENDA-TURNOS.md`](docs/14-AGENDA-TURNOS.md)):

- `POST /appointments`: reserva un turno solo si pasa las 4 validaciones
  del motor de disponibilidad (pertenencia al tenant, profesional
  habilitado para el servicio, horario dentro de la disponibilidad real,
  sin superposición con otro turno activo del mismo profesional).
- Estados del turno con transiciones validadas explícitamente (`pending` →
  `confirmed` → `completed`/`no_show`, `cancelled` desde `pending` o
  `confirmed`) — nunca un cambio de estado inválido silencioso.
- Un único `GET /appointments?from=&to=&...` para las vistas de día/
  semana/mes/lista (el mismo filtro por rango de fechas, el frontend arma
  la grilla según la vista).
- Lista de espera (`/waitlist`) para cuando no hay disponibilidad en la
  fecha que el cliente prefiere.

Implementado en Etapa 11 (detalle completo en
[`docs/15-PRODUCTOS-INVENTARIO.md`](docs/15-PRODUCTOS-INVENTARIO.md)):

- Primer módulo realmente **opcional**: `Products`/`Suppliers`/`Purchases`
  llevan `@RequiresFeature('inventory')` — sin ese feature flag habilitado
  para el negocio (jerarquía SUPER ADMIN → Plan → Negocio de la Etapa 4),
  los tres controllers enteros responden 403.
- Productos con SKU único por negocio, ajuste manual de stock (con
  motivo, nunca deja el stock negativo), y alerta de stock mínimo
  (`GET /products?lowStock=true`).
- Compras a un proveedor: `pending` no toca stock; `receive` incrementa el
  stock de cada ítem y actualiza el costo del producto, en una
  transacción.

Implementado en Etapa 12 (detalle completo en
[`docs/16-VENTAS-CAJA-GASTOS-COMISIONES.md`](docs/16-VENTAS-CAJA-GASTOS-COMISIONES.md)):

- `POST /sales`: ventas mixtas (servicios+productos) con el precio de cada
  ítem tomado SIEMPRE del catálogo (nunca del cliente), pagos combinados
  que tienen que sumar exactamente el total, descuento de stock
  transaccional (y reposición automática si se cancela la venta).
- Caja: un único registro abierto por sucursal a la vez; al cerrarla se
  calcula el arqueo real (efectivo declarado al abrir + ventas en efectivo
  − gastos de esa caja) contra lo contado a mano, con la diferencia
  siempre visible, nunca "ajustada".
- `GET /sales/commissions`: comisiones calculadas al vuelo sobre el
  subtotal de servicios de cada venta completada, usando el
  `commissionPercentage` de cada profesional (sembrado desde la Etapa 7,
  sin uso hasta ahora).

Ver instrucciones para correrlo en [`backend/README.md`](backend/README.md).

El resto de los módulos de negocio (fidelización, notificaciones, etc.) se
implementan en las etapas siguientes, en el orden definido en
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
| [`docs/10-CLIENTES.md`](docs/10-CLIENTES.md) | Etapa 6: modelo Client/ClientNote, CRUD, notas internas, ficha con historial placeholder, límite de plan |
| [`docs/11-PROFESIONALES.md`](docs/11-PROFESIONALES.md) | Etapa 7: modelo Professional/ProfessionalSchedule, CRUD, horario semanal propio, vínculo opcional a User, límite de plan |
| [`docs/12-SERVICIOS.md`](docs/12-SERVICIOS.md) | Etapa 8: modelo Service/ServiceProfessional, CRUD, categoría, duración/precio, profesionales habilitados |
| [`docs/13-HORARIOS.md`](docs/13-HORARIOS.md) | Etapa 9: BranchSchedule, ScheduleException, catálogo de feriados con override, endpoint de disponibilidad combinada |
| [`docs/14-AGENDA-TURNOS.md`](docs/14-AGENDA-TURNOS.md) | Etapa 10: Appointment/WaitlistEntry, motor de disponibilidad real, estados del turno, lista de espera |
| [`docs/15-PRODUCTOS-INVENTARIO.md`](docs/15-PRODUCTOS-INVENTARIO.md) | Etapa 11: Product/Supplier/Purchase, primer módulo gateado por Feature Flags, stock, compras |
| [`docs/16-VENTAS-CAJA-GASTOS-COMISIONES.md`](docs/16-VENTAS-CAJA-GASTOS-COMISIONES.md) | Etapa 12: Sale/CashRegister/Expense, ventas mixtas, pagos combinados, arqueo de caja, comisiones |
| [`docs/17-FIDELIZACION.md`](docs/17-FIDELIZACION.md) | Etapa 13: LoyaltyPointsTransaction/GiftCard/Referral/Promotion, cuatro módulos independientes gateados por Feature Flags |
| [`docs/18-NOTIFICACIONES.md`](docs/18-NOTIFICACIONES.md) | Etapa 14: Notification/CommunicationRead, centro de notificaciones + consumo de Comunicaciones + avisos de stock bajo y límite de plan |
| [`docs/19-MERCADO-PAGO-CLIENTES.md`](docs/19-MERCADO-PAGO-CLIENTES.md) | Etapa 15: TenantIntegration/Deposit, Mercado Pago por negocio (credenciales cifradas) para señas de turnos |
| [`docs/20-WHATSAPP.md`](docs/20-WHATSAPP.md) | Etapa 16: WhatsApp Business por negocio, confirmaciones/cancelaciones/recordatorios, webhook por tenant |

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

Continuar con la Etapa 17 del roadmap: Instagram / Facebook (Meta), según
el detalle de `docs/06-ROADMAP-ETAPAS.md`.
