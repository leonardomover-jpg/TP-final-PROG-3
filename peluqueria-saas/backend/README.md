# Backend — Prompt Maestro SaaS (Etapas 2 a 16)

NestJS + Prisma + PostgreSQL. Implementa Autenticación, Usuarios, RBAC y el
mecanismo de aislamiento multi-tenant (Etapa 2), el panel de SUPER ADMIN
completamente separado del de negocio (Etapa 3), Planes + Feature Flags con
límites de plan aplicados de verdad (Etapa 4), Suscripciones + Mercado
Pago — billing real de la plataforma (Etapa 5), Clientes/CRM (Etapa 6),
Profesionales (Etapa 7), Servicios (Etapa 8), Horarios (Etapa 9), Agenda
y Turnos (Etapa 10), Productos e Inventario (Etapa 11), Ventas + Caja +
Gastos + Comisiones (Etapa 12), Fidelización — Puntos/Gift Cards/
Referidos/Promociones (Etapa 13), Notificaciones — centro + avisos
internos de stock bajo y límite de plan (Etapa 14), Mercado Pago para
clientes — integraciones por negocio + señas de turnos (Etapa 15) y
WhatsApp (Meta Cloud API) — confirmaciones/cancelaciones/recordatorios por
negocio (Etapa 16). Ver `../docs/` para el diseño completo (arquitectura,
base de datos, seguridad, roadmap).

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

## Flujo mínimo de prueba manual — Servicios

```bash
# 1) Crear un servicio
curl -X POST http://localhost:3000/api/v1/services \
  -H "Authorization: Bearer <accessToken del negocio>" \
  -H "Content-Type: application/json" \
  -d '{"name":"Corte","durationMinutes":30,"price":5000,"category":"corte"}'

# 2) Habilitar profesionales para ese servicio (reemplaza la lista completa)
curl -X PUT http://localhost:3000/api/v1/services/<serviceId>/professionals \
  -H "Authorization: Bearer <accessToken del negocio>" \
  -H "Content-Type: application/json" \
  -d '{"professionalIds":["<professionalId>"]}'

# 3) Ver la ficha completa (datos + profesionales habilitados)
curl http://localhost:3000/api/v1/services/<serviceId> \
  -H "Authorization: Bearer <accessToken del negocio>"
```

## Flujo mínimo de prueba manual — Horarios

```bash
# 1) Cargar el horario semanal de la sucursal principal
curl -X PUT http://localhost:3000/api/v1/branches/<branchId>/schedule \
  -H "Authorization: Bearer <accessToken del negocio>" \
  -H "Content-Type: application/json" \
  -d '{"entries":[{"dayOfWeek":1,"startTime":"09:00","endTime":"18:00"}]}'

# 2) Ver el catálogo de feriados (con el override de este negocio, si tiene)
curl http://localhost:3000/api/v1/schedule/holidays \
  -H "Authorization: Bearer <accessToken del negocio>"

# 3) Decidir abrir igual un feriado puntual
curl -X PATCH http://localhost:3000/api/v1/schedule/holidays/<holidayId>/override \
  -H "Authorization: Bearer <accessToken del negocio>" \
  -H "Content-Type: application/json" \
  -d '{"isOpen":true}'

# 4) Consultar disponibilidad combinada para un día concreto
curl "http://localhost:3000/api/v1/schedule/availability?date=2026-03-04&branchId=<branchId>" \
  -H "Authorization: Bearer <accessToken del negocio>"
```

## Flujo mínimo de prueba manual — Agenda y Turnos

```bash
# 1) Reservar un turno (falla con 400/409 si no pasa el motor de
#    disponibilidad: profesional no habilitado, fuera de horario, o
#    superpuesto con otro turno activo)
curl -X POST http://localhost:3000/api/v1/appointments \
  -H "Authorization: Bearer <accessToken del negocio>" \
  -H "Content-Type: application/json" \
  -d '{"branchId":"<branchId>","professionalId":"<professionalId>","clientId":"<clientId>","serviceId":"<serviceId>","startAt":"2026-03-02T10:00:00.000Z"}'

# 2) Confirmar / completar / cancelar / marcar no-show
curl -X POST http://localhost:3000/api/v1/appointments/<appointmentId>/confirm \
  -H "Authorization: Bearer <accessToken del negocio>"

# 3) Listar turnos de un rango de fechas (la vista día/semana/mes/lista
#    del frontend es este mismo endpoint con distinto from/to)
curl "http://localhost:3000/api/v1/appointments?from=2026-03-02T00:00:00.000Z&to=2026-03-08T23:59:59.000Z" \
  -H "Authorization: Bearer <accessToken del negocio>"
```

## Flujo mínimo de prueba manual — Productos e Inventario

```bash
# 0) Requiere el feature flag "inventory" habilitado (plan Premium +
#    PATCH /feature-flags/inventory {"enabled":true}) — sin eso, 403.

# 1) Crear un producto
curl -X POST http://localhost:3000/api/v1/products \
  -H "Authorization: Bearer <accessToken del negocio>" \
  -H "Content-Type: application/json" \
  -d '{"name":"Shampoo 500ml","sku":"SH-500","price":4500,"stock":10,"minStock":3}'

# 2) Ver productos por debajo del stock mínimo
curl "http://localhost:3000/api/v1/products?lowStock=true" \
  -H "Authorization: Bearer <accessToken del negocio>"

# 3) Compra a un proveedor: crear (no toca stock) -> recibir (sí lo toca)
curl -X POST http://localhost:3000/api/v1/purchases \
  -H "Authorization: Bearer <accessToken del negocio>" \
  -H "Content-Type: application/json" \
  -d '{"supplierId":"<supplierId>","items":[{"productId":"<productId>","quantity":20,"unitCost":1200}]}'

curl -X POST http://localhost:3000/api/v1/purchases/<purchaseId>/receive \
  -H "Authorization: Bearer <accessToken del negocio>"
```

## Flujo mínimo de prueba manual — Ventas, Caja y Gastos

```bash
# 1) Abrir caja en una sucursal
curl -X POST http://localhost:3000/api/v1/cash-register/open \
  -H "Authorization: Bearer <accessToken del negocio>" \
  -H "Content-Type: application/json" \
  -d '{"branchId":"<branchId>","openingAmount":1000}'

# 2) Registrar una venta mixta con pagos combinados
curl -X POST http://localhost:3000/api/v1/sales \
  -H "Authorization: Bearer <accessToken del negocio>" \
  -H "Content-Type: application/json" \
  -d '{"branchId":"<branchId>","cashRegisterId":"<cashRegisterId>","professionalId":"<professionalId>","items":[{"itemType":"service","serviceId":"<serviceId>","quantity":1},{"itemType":"product","productId":"<productId>","quantity":2}],"payments":[{"method":"cash","amount":5000},{"method":"card","amount":6000}]}'

# 3) Ver comisiones acumuladas de un profesional
curl "http://localhost:3000/api/v1/sales/commissions?professionalId=<professionalId>" \
  -H "Authorization: Bearer <accessToken del negocio>"

# 4) Cerrar caja (arqueo: efectivo esperado vs. contado)
curl -X POST http://localhost:3000/api/v1/cash-register/<cashRegisterId>/close \
  -H "Authorization: Bearer <accessToken del negocio>" \
  -H "Content-Type: application/json" \
  -d '{"closingAmount":6000}'
```

## Flujo mínimo de prueba manual — Fidelización

Requiere habilitar cada flag (`points`/`gift_cards`/`referrals`/
`promotions`) para el negocio — ver el flujo de Planes y Feature Flags más
arriba.

```bash
# 1) Otorgar puntos a un cliente y consultar el saldo
curl -X POST http://localhost:3000/api/v1/points/award \
  -H "Authorization: Bearer <accessToken del negocio>" \
  -H "Content-Type: application/json" \
  -d '{"clientId":"<clientId>","amount":100,"reason":"Bienvenida"}'
curl http://localhost:3000/api/v1/points/balance/<clientId> \
  -H "Authorization: Bearer <accessToken del negocio>"

# 2) Emitir una gift card (código autogenerado) y canjear saldo parcial
curl -X POST http://localhost:3000/api/v1/gift-cards \
  -H "Authorization: Bearer <accessToken del negocio>" \
  -H "Content-Type: application/json" \
  -d '{"initialBalance":5000}'
curl -X POST http://localhost:3000/api/v1/gift-cards/<giftCardId>/redeem \
  -H "Authorization: Bearer <accessToken del negocio>" \
  -H "Content-Type: application/json" \
  -d '{"amount":1500,"reason":"Corte + color"}'

# 3) Registrar un referido y completarlo (acredita los puntos de recompensa)
curl -X POST http://localhost:3000/api/v1/referrals \
  -H "Authorization: Bearer <accessToken del negocio>" \
  -H "Content-Type: application/json" \
  -d '{"referrerClientId":"<clientId1>","referredClientId":"<clientId2>","rewardPoints":50}'
curl -X POST http://localhost:3000/api/v1/referrals/<referralId>/complete \
  -H "Authorization: Bearer <accessToken del negocio>"

# 4) Crear una promoción
curl -X POST http://localhost:3000/api/v1/promotions \
  -H "Authorization: Bearer <accessToken del negocio>" \
  -H "Content-Type: application/json" \
  -d '{"name":"Verano 2026","code":"VERANO26","discountType":"percentage","discountValue":15}'
```

## Flujo mínimo de prueba manual — Notificaciones

```bash
# 1) Ver el centro de notificaciones (buzón propio + comunicaciones aplicables)
curl http://localhost:3000/api/v1/notifications \
  -H "Authorization: Bearer <accessToken del negocio>"

# 2) Contador de no leídas
curl http://localhost:3000/api/v1/notifications/unread-count \
  -H "Authorization: Bearer <accessToken del negocio>"

# 3) Marcar una notificación propia (de sistema) como leída
curl -X PATCH http://localhost:3000/api/v1/notifications/<notificationId>/read \
  -H "Authorization: Bearer <accessToken del negocio>"

# 4) Marcar una comunicación global como leída
curl -X PATCH http://localhost:3000/api/v1/notifications/communications/<communicationId>/read \
  -H "Authorization: Bearer <accessToken del negocio>"

# 5) Marcar todo como leído
curl -X PATCH http://localhost:3000/api/v1/notifications/read-all \
  -H "Authorization: Bearer <accessToken del negocio>"

# Los avisos de stock bajo (POST /products/:id/stock-adjustment cruzando el
# mínimo, o una venta que lo cruce) y de límite de plan (75%/90% al crear
# un usuario/sucursal/cliente/profesional) se generan solos — no hay
# endpoint para dispararlos a mano.
```

## Flujo mínimo de prueba manual — Mercado Pago para clientes (señas)

```bash
# 1) Conectar la cuenta de Mercado Pago DEL NEGOCIO (se valida contra
#    GET /users/me antes de guardar; usar credenciales de TEST)
curl -X POST http://localhost:3000/api/v1/integrations/mercado-pago/connect \
  -H "Authorization: Bearer <accessToken del negocio>" \
  -H "Content-Type: application/json" \
  -d '{"accessToken":"TEST-...","publicKey":"TEST-...","webhookSecret":"<secreto configurado en Tus integraciones>"}'

# 2) Generar una seña para un turno existente (devuelve el link de checkout)
curl -X POST http://localhost:3000/api/v1/deposits \
  -H "Authorization: Bearer <accessToken del negocio>" \
  -H "Content-Type: application/json" \
  -d '{"appointmentId":"<appointmentId>","amount":1500}'

# 3) Ver el estado de una seña (solo cambia vía webhook, nunca a mano)
curl http://localhost:3000/api/v1/deposits/<depositId> \
  -H "Authorization: Bearer <accessToken del negocio>"

# 4) El webhook (POST /webhooks/mercado-pago/tenant/:tenantId) lo llama
#    Mercado Pago — se prueba con el simulador de webhooks del dashboard
#    DE LA CUENTA CONECTADA EN EL PASO 1 (firma con SU webhook secret).
```

## Flujo mínimo de prueba manual — WhatsApp

Requiere el plan Premium (incluye todos los flags) y habilitar `whatsapp`
para el negocio — ver el flujo de Planes y Feature Flags más arriba.

```bash
# 1) Conectar la cuenta de WhatsApp Business DEL NEGOCIO (se valida contra
#    GET /{phoneNumberId} antes de guardar)
curl -X POST http://localhost:3000/api/v1/integrations/whatsapp/connect \
  -H "Authorization: Bearer <accessToken del negocio>" \
  -H "Content-Type: application/json" \
  -d '{"accessToken":"EAA...","phoneNumberId":"109876543210987","appSecret":"<App Secret de Meta>","verifyToken":"<elegido por el negocio>"}'

# 2) Confirmar un turno dispara el WhatsApp de confirmación solo (best-effort)
curl -X POST http://localhost:3000/api/v1/appointments/<appointmentId>/confirm \
  -H "Authorization: Bearer <accessToken del negocio>"

# 3) Recordatorio manual (sin scheduler todavía)
curl -X POST http://localhost:3000/api/v1/appointments/<appointmentId>/send-reminder \
  -H "Authorization: Bearer <accessToken del negocio>"

# 4) El webhook (GET para el handshake, POST para mensajes entrantes en
#    /webhooks/whatsapp/tenant/:tenantId) lo llama Meta — configurar esa
#    URL y el verify_token del paso 1 en el dashboard de la app de Meta.
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
├── services/                         # CRUD de servicios, categoría, duración/precio, profesionales habilitados
├── schedule/                          # excepciones, feriados (override por negocio), disponibilidad combinada
├── appointments/                       # turnos: motor de disponibilidad, estados, listado por rango
├── waitlist/                            # lista de espera (reusa permisos turnos.*)
├── products/                             # catálogo de productos, stock, ajustes, alerta de stock mínimo
├── suppliers/                             # proveedores
├── purchases/                              # compras con ítems (pending -> received incrementa stock)
├── cash-register/                           # apertura/cierre de caja con arqueo
├── sales/                                    # ventas mixtas, pagos combinados, comisiones
├── expenses/                                  # gastos categorizados (opcionalmente atados a una caja)
├── points/                                     # puntos de fidelización: otorgar/canjear (ledger)
├── gift-cards/                                  # gift cards: emitir, canjear, cancelar
├── referrals/                                    # referidos entre clientes: registrar/completar
├── promotions/                                    # catálogo de promociones (CRUD, sin aplicación a Sale)
├── notifications/                                  # centro de notificaciones + avisos internos (stock bajo, límite de plan)
├── integrations/                                    # TenantIntegration: conectar/desconectar Mercado Pago/WhatsApp por negocio
├── deposits/                                          # señas para turnos (checkout con la cuenta del negocio)
├── whatsapp/                                            # WhatsAppService (envío) + whatsapp-client.ts (Meta Cloud API)
├── common/
│   ├── dto/                            # DTOs compartidos entre módulos (ej. set-schedule.dto.ts)
│   └── crypto/                          # cifrado AES-256-GCM de credenciales por tenant
├── support/                       # tickets de soporte, lado negocio (tenant-scoped)
├── feature-flags/                  # FeatureFlagsService (jerarquía) + FeatureFlagGuard, lado negocio
├── plan-limits/                     # PlanLimitsService + PlanLimitsGuard (límites de plan)
├── plan-info/                        # GET /plan — plan actual + uso vs. límites
├── mercado-pago/                      # MercadoPagoService (plataforma) + mercado-pago-client.ts (funciones puras compartidas)
├── subscriptions/                      # elegir plan, checkout, estado de la suscripción (lado negocio)
├── webhooks/
│   ├── mercado-pago/                     # notificaciones de pago de SUSCRIPCIÓN (cuenta de la plataforma)
│   ├── mercado-pago-tenant/               # notificaciones de pago de SEÑAS (cuenta de cada negocio, por tenantId en la URL)
│   └── whatsapp-tenant/                    # handshake + mensajes entrantes de WhatsApp (cuenta de cada negocio, por tenantId)
├── platform-admin/                       # todo lo de SUPER ADMIN — dominio de auth separado
│   ├── auth/                              # login+MFA en 2 pasos, JWT/estrategia propios
│   ├── tenants/                            # alta/búsqueda/suspender/reactivar/cancelar/asignar plan
│   ├── audit/                               # lectura de auditoría global
│   ├── support/                              # tickets de soporte, lado SUPER ADMIN (todos los tenants)
│   ├── communications/                        # comunicaciones globales (todos/plan/negocios puntuales)
│   ├── plans/                                  # CRUD de planes + asociación de feature flags
│   ├── feature-flags/                           # catálogo global de feature flags
│   ├── holidays/                                 # catálogo global de feriados argentinos
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
├── services.spec.ts                                # CRUD, profesionales habilitados, aislamiento cross-tenant
├── schedule.spec.ts                                # horario semanal, excepciones, feriados+override, disponibilidad
├── appointments.spec.ts                            # motor de disponibilidad, transiciones, lista de espera
├── products.spec.ts                                # gate de feature flag, stock, compras, aislamiento
├── sales.spec.ts                                   # ventas mixtas, pagos combinados, arqueo, comisiones
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
