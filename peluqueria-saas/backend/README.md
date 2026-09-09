# Backend — Prompt Maestro SaaS (Etapas 2 a 26 — completo)

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
clientes — integraciones por negocio + señas de turnos (Etapa 15),
WhatsApp (Meta Cloud API) — confirmaciones/cancelaciones/recordatorios por
negocio (Etapa 16), Instagram / Facebook (Meta) — mensajería por negocio
(Etapa 17), Página pública + QR (Etapa 18, solo backend: catálogo,
disponibilidad y reserva sin login + QR — sin proyecto de frontend en este
repo, la página HTML y la PWA quedan diferidas), y Sucursales — permisos
por sucursal + inventario por sucursal (Etapa 19), y Dashboard,
Estadísticas y Reportes — CSV/PDF/Excel (Etapa 20), e IA — insights sobre
estadísticas y clientes (Etapa 21, opcional), y Auditoría avanzada y
Observabilidad — AuditInterceptor global, GET /audit, GET /health
(Etapa 22), y Seguridad hardening — RLS de Postgres, helmet, pentest
interno (Etapa 23), y Backups — pg_dump + checksum + verificación real
por restauración (Etapa 24), Testing end-to-end y de carga — flujo real
encadenado + load test hasta 10.000 negocios simulados en una base
descartable (Etapa 25), y Deploy — imagen Docker multi-stage lista para
correr, `docker-compose.yml` (Etapa 26). Ver `../docs/` para el diseño
completo (arquitectura, base de datos, seguridad, roadmap).

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

## Flujo mínimo de prueba manual — Instagram / Facebook

Requiere el plan Premium y habilitar `facebook`/`instagram` para el
negocio — ver el flujo de Planes y Feature Flags más arriba.

```bash
# 1) Conectar la Página de Facebook DEL NEGOCIO (se valida contra
#    GET /{pageId} antes de guardar)
curl -X POST http://localhost:3000/api/v1/integrations/facebook/connect \
  -H "Authorization: Bearer <accessToken del negocio>" \
  -H "Content-Type: application/json" \
  -d '{"accessToken":"EAA...","externalAccountId":"<Page ID>","appSecret":"<App Secret de Meta>","verifyToken":"<elegido por el negocio>"}'

# 2) Responder un mensaje entrante (el recipientId sale de la notificación
#    que generó el webhook)
curl -X POST http://localhost:3000/api/v1/meta-messaging/reply \
  -H "Authorization: Bearer <accessToken del negocio>" \
  -H "Content-Type: application/json" \
  -d '{"provider":"facebook","recipientId":"<psid del cliente>","message":"Hola! Te confirmamos tu turno."}'

# 3) Los webhooks (GET para el handshake, POST para mensajes entrantes en
#    /webhooks/facebook/tenant/:tenantId y /webhooks/instagram/tenant/:tenantId)
#    los llama Meta — configurar esas URLs y el verify_token del paso 1
#    en el dashboard de la app de Meta. Instagram sigue el mismo patrón
#    con /integrations/instagram/connect.
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

## Flujo mínimo de prueba manual — Página pública + QR (Etapa 18)

Sin login — el `:tenantSlug` es el que se eligió en `register-tenant`.
Requiere tener al menos una sucursal/servicio/profesional habilitado
(ver los flujos de arriba).

```bash
# 1) Catálogo público del negocio (solo campos seguros)
curl http://localhost:3000/api/v1/public/<slug>

# 2) Disponibilidad (mismo formato que /schedule/availability, Etapa 9)
curl "http://localhost:3000/api/v1/public/<slug>/availability?date=2026-03-02&professionalId=<id>"

# 3) Reservar sin login (crea el Client si no existe uno con ese
#    teléfono/email, respetando el límite de clientes del plan)
curl -X POST http://localhost:3000/api/v1/public/<slug>/appointments \
  -H "Content-Type: application/json" \
  -d '{"clientFirstName":"Marta","clientLastName":"Lopez","clientPhone":"+541122223333","branchId":"<id>","professionalId":"<id>","serviceId":"<id>","startAt":"2026-03-02T10:00:00.000Z"}'

# 4) Código QR (PNG) — hoy apunta al propio catálogo JSON (no hay página
#    HTML todavía, ver docs/22-PAGINA-PUBLICA-QR-PWA.md §5)
curl http://localhost:3000/api/v1/public/<slug>/qr -o qr.png
```

## Flujo mínimo de prueba manual — Sucursales (Etapa 19)

```bash
# 1) Crear una segunda sucursal
curl -X POST http://localhost:3000/api/v1/branches \
  -H "Authorization: Bearer <accessToken del negocio>" \
  -H "Content-Type: application/json" \
  -d '{"name":"Sucursal Sur"}'

# 2) Crear un rol SIN sucursales.todas (el dueño la tiene automáticamente,
#    no hace falta crearla para él)
curl -X POST http://localhost:3000/api/v1/roles \
  -H "Authorization: Bearer <accessToken del negocio>" \
  -H "Content-Type: application/json" \
  -d '{"name":"Staff Sucursal","permissionKeys":["turnos.crear","turnos.ver","ventas.crear","caja.abrir"]}'

# 3) Crear el usuario asignado SOLO a la sucursal principal (branchIds)
curl -X POST http://localhost:3000/api/v1/users \
  -H "Authorization: Bearer <accessToken del negocio>" \
  -H "Content-Type: application/json" \
  -d '{"firstName":"Staff","lastName":"Sucursal","email":"staff@negocio.com","password":"Secreta123!","roleIds":["<roleId>"],"branchIds":["<branchIdPrincipal>"]}'

# 4) Ese usuario intentando crear un turno en la OTRA sucursal -> 403
curl -X POST http://localhost:3000/api/v1/appointments \
  -H "Authorization: Bearer <accessToken del staff>" \
  -H "Content-Type: application/json" \
  -d '{"branchId":"<idOtraSucursal>", ...}'

# 5) Producto exclusivo de una sucursal (branchId) — vender desde otra
#    sucursal responde 400 "pertenece a otra sucursal"
curl -X POST http://localhost:3000/api/v1/products \
  -H "Authorization: Bearer <accessToken del negocio>" \
  -H "Content-Type: application/json" \
  -d '{"name":"Shampoo","price":3000,"stock":10,"branchId":"<branchIdPrincipal>"}'
```

## Flujo mínimo de prueba manual — Dashboard y Reportes (Etapa 20)

```bash
# 1) Métricas agregadas del período (sin from/to = todo el historial)
curl "http://localhost:3000/api/v1/reports/dashboard?from=2026-01-01&to=2026-12-31" \
  -H "Authorization: Bearer <accessToken del negocio>"

# 2) Export de ventas en CSV
curl "http://localhost:3000/api/v1/reports/sales/export?format=csv" \
  -H "Authorization: Bearer <accessToken del negocio>" -o ventas.csv

# 3) Export de turnos en Excel
curl "http://localhost:3000/api/v1/reports/appointments/export?format=xlsx" \
  -H "Authorization: Bearer <accessToken del negocio>" -o turnos.xlsx

# 4) Export de ventas en PDF
curl "http://localhost:3000/api/v1/reports/sales/export?format=pdf" \
  -H "Authorization: Bearer <accessToken del negocio>" -o ventas.pdf
```

## Flujo mínimo de prueba manual — IA (Etapa 21)

Requiere el plan Premium y habilitar `ai` para el negocio (ver el flujo
de Planes y Feature Flags más arriba), y `AI_API_KEY` configurada en el
`.env` del servidor (API de Anthropic).

```bash
curl "http://localhost:3000/api/v1/ai/insights" \
  -H "Authorization: Bearer <accessToken del negocio>"
# -> { "insights": "1. ...\n2. ...", "basedOn": { "sales": {...}, "clients": {...}, ... } }
```

## Flujo mínimo de prueba manual — Auditoría y Observabilidad (Etapa 22)

```bash
# 1) Salud del servicio (sin autenticación)
curl http://localhost:3000/api/v1/health
# -> { "status": "ok", "database": "ok", "uptimeSeconds": 123 }

# 2) Cualquier mutación ya genera auditoría automática (ej. crear una
#    sucursal) — no hace falta nada especial del lado del cliente.
curl -X POST http://localhost:3000/api/v1/branches \
  -H "Authorization: Bearer <accessToken del negocio>" \
  -H "Content-Type: application/json" -d '{"name":"Sucursal Norte"}'

# 3) Ver el propio registro de auditoría
curl "http://localhost:3000/api/v1/audit?entityType=branches" \
  -H "Authorization: Bearer <accessToken del negocio>"
```

## Flujo mínimo de prueba manual — Seguridad hardening (Etapa 23)

```bash
# 1) Cabeceras de seguridad de helmet (y sin X-Powered-By)
curl -s -D - -o /dev/null http://localhost:3000/api/v1/health | grep -Ei "x-content-type|x-frame|x-powered"

# 2) Un JWT manipulado se rechaza (401)
curl -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/v1/branches \
  -H "Authorization: Bearer token.manipulado.aca"

# 3) Ver las políticas de RLS ya creadas (inertes hoy sin FORCE, ver doc
#    27-SEGURIDAD-HARDENING.md §2)
psql "$DATABASE_URL" -c "SELECT tablename, policyname FROM pg_policies WHERE schemaname='public';"
```

## Flujo mínimo de prueba manual — Backups (Etapa 24)

```bash
# 1) Correr un backup manualmente (SUPER ADMIN): dump real + checksum +
#    verificación por restauración en una base descartable
curl -X POST http://localhost:3000/api/v1/platform-admin/backups/run \
  -H "Authorization: Bearer <accessToken de SUPER ADMIN>"
# -> { "status": "verified", "sizeBytes": ..., "checksumSha256": "...", ... }

# 2) Listar backups corridos
curl "http://localhost:3000/api/v1/platform-admin/backups" \
  -H "Authorization: Bearer <accessToken de SUPER ADMIN>"

# 3) Lo mismo pero disparado como lo haría un cron externo, sin HTTP
npm run backup:run
```

## Flujo mínimo de prueba manual — Testing de carga (Etapa 25)

```bash
# Load test completo: hasta 10.000 tenants simulados en una base
# Postgres descartable (nunca toca la de dev/test) — imprime la tabla de
# latencias por checkpoint y el EXPLAIN ANALYZE del checkpoint más grande.
npm run loadtest:run

# Corrida rápida (checkpoints más chicos), útil en desarrollo:
LOAD_TEST_CHECKPOINTS="10,100" npm run loadtest:run

# El test end-to-end (flujo real completo) corre como parte de la suite normal:
npx jest test/e2e-business-flow.spec.ts
```

## Flujo mínimo de prueba manual — Deploy (Etapa 26)

```bash
# Build de la imagen de producción
docker build -t peluqueria-saas-backend .

# Orquestación completa (backend + Postgres) desde la carpeta padre
cd ..
cp backend/.env.example backend/.env   # completar secretos reales
docker compose up --build
docker compose run --rm backend npx prisma migrate deploy
docker compose run --rm backend npm run prisma:seed
```

Ver `../docs/30-DEPLOY.md` para el detalle del Dockerfile multi-stage,
por qué las migraciones no corren solas al arrancar el contenedor, y qué
se pudo validar sin un daemon de Docker disponible en este sandbox.

## Estructura

```
src/
├── auth/                     # login, refresh, register-tenant, JWT strategy, guards (negocio)
├── prisma/                   # PrismaService (crudo) + TenantPrismaService (tenant-scoped)
├── users/                     # CRUD de usuarios (tenant-scoped, soft delete, PlanLimitsGuard)
├── roles/                      # CRUD de roles (sistema + propios del negocio)
├── permissions/                 # catálogo global de permisos (solo lectura)
├── branches/                     # CRUD de sucursales (PlanLimitsGuard) + BranchAccessGuard (Etapa 19)
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
├── integrations/                                    # TenantIntegration: conectar/desconectar Mercado Pago/WhatsApp/Facebook/Instagram por negocio
├── deposits/                                          # señas para turnos (checkout con la cuenta del negocio)
├── whatsapp/                                            # WhatsAppService (envío) + whatsapp-client.ts (Meta Cloud API)
├── meta/                                                 # meta-client.ts — Graph API de Facebook Messenger/Instagram
├── meta-messaging/                                        # responder mensajes entrantes de Facebook/Instagram (manual)
├── common/
│   ├── dto/                            # DTOs compartidos entre módulos (ej. set-schedule.dto.ts)
│   └── crypto/                          # cifrado AES-256-GCM de credenciales + verificación de webhooks de Meta
├── support/                       # tickets de soporte, lado negocio (tenant-scoped)
├── feature-flags/                  # FeatureFlagsService (jerarquía) + FeatureFlagGuard, lado negocio
├── plan-limits/                     # PlanLimitsService + PlanLimitsGuard (límites de plan)
├── plan-info/                        # GET /plan — plan actual + uso vs. límites
├── mercado-pago/                      # MercadoPagoService (plataforma) + mercado-pago-client.ts (funciones puras compartidas)
├── subscriptions/                      # elegir plan, checkout, estado de la suscripción (lado negocio)
├── webhooks/
│   ├── mercado-pago/                     # notificaciones de pago de SUSCRIPCIÓN (cuenta de la plataforma)
│   ├── mercado-pago-tenant/               # notificaciones de pago de SEÑAS (cuenta de cada negocio, por tenantId en la URL)
│   ├── whatsapp-tenant/                    # handshake + mensajes entrantes de WhatsApp (cuenta de cada negocio, por tenantId)
│   └── meta-tenant/                         # handshake + mensajes entrantes de Facebook/Instagram (por tenantId)
├── platform-admin/                       # todo lo de SUPER ADMIN — dominio de auth separado
│   ├── auth/                              # login+MFA en 2 pasos, JWT/estrategia propios
│   ├── tenants/                            # alta/búsqueda/suspender/reactivar/cancelar/asignar plan
│   ├── audit/                               # lectura de auditoría global
│   ├── support/                              # tickets de soporte, lado SUPER ADMIN (todos los tenants)
│   ├── communications/                        # comunicaciones globales (todos/plan/negocios puntuales)
│   ├── plans/                                  # CRUD de planes + asociación de feature flags
│   ├── feature-flags/                           # catálogo global de feature flags
│   ├── holidays/                                 # catálogo global de feriados argentinos
│   ├── subscriptions/                            # ver suscripciones/vencimientos de todos los negocios
│   └── backups/                                   # pg_dump + checksum + verificación real por restauración (Etapa 24)
├── public-booking/                                 # catálogo/disponibilidad/reserva sin login (Etapa 18, solo backend) + QR
├── reports/                                          # dashboard de métricas + export CSV/PDF/Excel (Etapa 20)
├── ai/                                                 # GET /ai/insights — resumen generado por IA (Etapa 21, opcional)
├── audit/                                              # AuditInterceptor global + GET /audit propio del negocio (Etapa 22)
├── health/                                              # GET /health — conectividad real a la base (Etapa 22)
├── common/filters/                                 # manejo de errores (nunca se expone detalle técnico)
└── app.module.ts                                    # wiring de guards globales + throttler

prisma/
├── schema.prisma    # modelo de datos (fundacional + auth + SUPER ADMIN + planes/flags + suscripciones)
├── migrations/       # historial versionado del schema (nunca a mano en prod)
└── seed.ts             # permisos + roles de sistema + bootstrap de SUPER ADMIN + planes/flags de ejemplo

Dockerfile          # build multi-stage (Etapa 26) — ver ../docs/30-DEPLOY.md
.dockerignore
../docker-compose.yml   # orquestación local/staging (Postgres + backend)

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
├── public-booking.spec.ts                          # catálogo/disponibilidad/reserva sin login, límite de plan, QR, aislamiento
├── branches-multi.spec.ts                          # BranchAccessGuard (UserBranch/sucursales.todas), inventario por sucursal
├── reports.spec.ts                                 # dashboard, export CSV/PDF/Excel, permisos, aislamiento
├── ai.spec.ts                                      # insights de IA (mockeado), flag, credenciales, aislamiento
├── audit.spec.ts                                   # AuditInterceptor global, GET /audit, permisos, aislamiento
├── health.spec.ts                                  # GET /health
├── security-hardening.spec.ts                      # pentest interno: JWT expirado/manipulado, helmet, mass assignment, fuga de errores
├── backups.spec.ts                                 # pg_dump + checksum + verificación real por restauración, listado/detalle, 401
├── e2e-business-flow.spec.ts                       # flujo real encadenado de punta a punta (Etapa 25), distinto de los tests por módulo
└── helpers/platform-admin.ts                       # helper compartido: crear+loguear un SUPER ADMIN
```

`scripts/run-backup.ts` (`npm run backup:run`, Etapa 24): punto de entrada
sin HTTP para que un cron externo dispare `PlatformAdminBackupsService.run()`
— ver `../docs/28-BACKUPS.md` §5.

`scripts/load-test/run-load-test.ts` (`npm run loadtest:run`, Etapa 25):
puebla hasta 10.000 tenants sintéticos en una base Postgres DESCARTABLE
(nunca la de dev/test) y mide si leer los datos de un tenant se pone más
lento a medida que la plataforma crece — ver `../docs/29-TESTING-CARGA.md`.

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
