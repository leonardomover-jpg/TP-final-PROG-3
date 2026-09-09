# 06 — Roadmap de Etapas

Orden de desarrollo, siguiendo el orden de dependencias real (doc `01`,
sección 3) y el orden sugerido en el pedido original (punto 99), ajustado
donde el grafo de dependencias lo exige (ej. Multi-tenancy y RBAC deben
existir *antes* de Super Admin/Planes en términos de modelo de datos, aunque
el pedido los liste después — ya reflejado en el `schema.prisma`
fundacional de esta Etapa 1).

Cada etapa se entrega siguiendo la metodología de 11 pasos del punto 100 del
pedido (Analizar → Dependencias → Base de datos → Backend → API → Frontend
→ Seguridad → Testing → Integración → Documentación → Revisión), y no se
pasa a la siguiente hasta cerrar el checklist de revisión.

## Checklist de revisión (se repite al final de cada etapa)

```
¿Funciona?
¿Es seguro?
¿Respeta multi-tenancy?
¿Respeta permisos?
¿Respeta Feature Flags?
¿Respeta el plan?
¿Tiene tests?
¿Está documentado?
```

## Etapas

- [x] **Etapa 1 — Análisis y Arquitectura** (esta entrega): módulos,
      dependencias, arquitectura, stack, estrategia multi-tenant, schema
      fundacional (Tenant/Branch/User/Role/Permission/Plan/FeatureFlag/
      Subscription/AuditLog), seguridad baseline, riesgos detectados.
- [x] **Etapa 2 — Autenticación + Usuarios + RBAC + Multi-tenancy (código)**:
      backend NestJS + Prisma real (`peluqueria-saas/backend`). Login/refresh
      con rotación y revocación, `TenantPrismaService` (Prisma Client
      Extension) como único punto de filtrado por tenant, `PermissionsGuard`
      con resolución fresca por request, CRUD de usuarios/roles/sucursales,
      seed de permisos y roles de sistema, y 21 tests automatizados pasando
      contra PostgreSQL real — incluyendo el test de aislamiento entre
      tenants (IDOR) exigido por el punto 73 del pedido. MFA para
      PlatformAdmin queda pendiente para la Etapa 3 (junto con el propio
      panel de SUPER ADMIN).
- [x] **Etapa 3 — SUPER ADMIN (panel y API separados)**: dominio de auth
      totalmente separado del de negocio (`PlatformAdmin`, secretos JWT
      propios, estrategia passport propia), MFA (TOTP) obligatorio en dos
      pasos, bloqueo de cuenta por intentos fallidos + rate limiting global
      (`@nestjs/throttler`), CRUD de negocios (alta/búsqueda/filtro/
      suspender/reactivar/cancelar) con efecto inmediato sobre sesiones
      activas, auditoría global paginada, soporte (tickets negocio ↔ SUPER
      ADMIN) y comunicaciones globales (todos/plan/negocios puntuales,
      creación + listado — el consumo del lado negocio queda para la Etapa
      14). 39 tests en la suite completa. Detalle en
      `docs/07-SUPER-ADMIN.md`.
- [x] **Etapa 4 — Planes y Feature Flags (código)**: `FeatureFlagsService`
      (único lugar que resuelve SUPER ADMIN → Plan → Negocio),
      `FeatureFlagGuard`/`@RequiresFeature` (infraestructura lista para los
      módulos opcionales de etapas siguientes), `PlanLimitsService`/
      `PlanLimitsGuard`/`@LimitResource` ya conectado a `users` y
      `branches`, CRUD de planes/feature flags desde SUPER ADMIN
      (`platform-admin/plans`, `platform-admin/feature-flags`) +
      asignación de plan a un negocio existente, endpoints de negocio
      `GET/PATCH /feature-flags` y `GET /plan`. Sin migraciones nuevas — el
      modelo ya estaba diseñado desde la Etapa 1. 47 tests en la suite
      completa (8 nuevos). Detalle en
      `docs/08-PLANES-Y-FEATURE-FLAGS-CODIGO.md`.
- [x] **Etapa 5 — Suscripciones + Mercado Pago (billing de la plataforma)**:
      `MercadoPagoService` encapsulado (Checkout Pro real, forma verificada
      contra documentación oficial — ver doc `09` §3), elegir/cambiar plan
      (trial de 14 días + `Tenant.planId` sincronizado), checkout real,
      webhook con validación de firma HMAC-SHA256 + idempotencia real por
      constraint único (no por "check antes de insertar"), suscripciones
      visibles para SUPER ADMIN. `expiringSoon`/vencimiento calculados
      siempre con fecha del servidor. El downgrade automático por
      vencimiento y el procesamiento del webhook en background quedan para
      cuando exista infraestructura de jobs (documentado como decisión de
      scope, no como olvido). 53 tests en la suite completa (6 nuevos).
      Detalle en `docs/09-SUSCRIPCIONES-MERCADO-PAGO.md` (incluye un bug
      real de scoping de NestJS encontrado y corregido en esta etapa).
- [x] **Etapa 6 — Clientes (CRM)**: modelo `Client`/`ClientNote`
      tenant-scoped, CRUD completo (`clientes.ver/crear/editar/eliminar`,
      permisos ya seedeados desde la Etapa 2), `PlanLimitsGuard` con
      `@LimitResource('clients')` (el `switch` ya estaba preparado desde
      la Etapa 4), ficha con notas internas + historial placeholder
      (Turnos/Ventas/Puntos se agregan cuando existan esas etapas), soft
      delete conserva el historial. 59 tests en la suite completa (6
      nuevos). Detalle en `docs/10-CLIENTES.md`.
- [x] **Etapa 7 — Profesionales**: modelo `Professional`/
      `ProfessionalSchedule` tenant-scoped, CRUD completo (permisos nuevos
      `profesionales.ver/crear/editar/eliminar`), especialidades como tags
      libres (el catálogo formal es de la Etapa 8), horario semanal propio
      reemplazable por `PUT .../schedule` (el motor de disponibilidad con
      excepciones/feriados es de la Etapa 9), comisión (% de configuración,
      el cálculo real es de la Etapa 12), vínculo opcional 1:1 a `User`,
      `PlanLimitsGuard` con `@LimitResource('professionals')` (usando
      `Plan.maxProfessionals`, en el schema desde la Etapa 1 sin uso hasta
      ahora). 65 tests en la suite completa (6 nuevos). Detalle en
      `docs/11-PROFESIONALES.md`.
- [x] **Etapa 8 — Servicios**: modelo `Service`/`ServiceProfessional`
      tenant-scoped, CRUD completo (permisos nuevos
      `servicios.ver/crear/editar/eliminar`), categoría como tag libre
      (mismo criterio que `Professional.specialties`), duración/precio,
      profesionales habilitados por servicio (M:N real, reemplazable por
      `PUT .../professionals`, valida pertenencia al tenant de ambos
      extremos). Sin `PlanLimitsGuard` a propósito — `Plan` no tiene
      `maxServices`, el pedido no anticipó ese límite. 69 tests en la
      suite completa (4 nuevos). Detalle en `docs/12-SERVICIOS.md`.
- [x] **Etapa 9 — Horarios**: `BranchSchedule` (horario semanal de la
      sucursal, mismo shape que `ProfessionalSchedule` de la Etapa 7,
      `PUT /branches/:id/schedule`), `ScheduleException` (excepción
      puntual para una sucursal o un profesional, cierre o horario
      distinto), catálogo global de feriados argentinos gestionado por
      SUPER ADMIN (`platform-admin/holidays`, seedeado con los 10
      inamovibles de 2026 — los trasladables no se inventan sin decreto
      confirmado, doc `13` §4) con override manual por negocio
      (`TenantHolidayOverride`, default cerrado), y `GET
      /schedule/availability` combinando las tres fuentes para responder
      "¿abierto tal día, y en qué horario?" (permisos nuevos
      `horarios.ver/gestionar`). El motor de disponibilidad real con
      generación de slots y sin superposición con turnos ya tomados es de
      la Etapa 10, que consume este cálculo. 76 tests en la suite completa
      (7 nuevos). Detalle en `docs/13-HORARIOS.md`.
- [x] **Etapa 10 — Agenda y Turnos**: `Appointment`/`WaitlistEntry`
      tenant-scoped. Motor de disponibilidad real en `AppointmentsService.create`:
      valida pertenencia al tenant de sucursal/profesional/cliente/servicio,
      que el profesional esté habilitado para el servicio (Etapa 8), que
      el horario caiga dentro de `ScheduleService.getAvailability` (Etapa
      9), y que no se superponga con otro turno activo del mismo
      profesional. Estados con transiciones validadas (pending → confirmed
      → completed, cancelled desde pending/confirmed, no_show desde
      confirmed), lista de espera (reusa permisos `turnos.*`). Vistas
      día/semana/mes/lista son el mismo `GET /appointments` con distinto
      rango de fechas, sin endpoints separados. Señas quedan para la Etapa
      15 (dependen de Mercado Pago para clientes). 85 tests en la suite
      completa (9 nuevos). Detalle en `docs/14-AGENDA-TURNOS.md`.
- [x] **Etapa 11 — Productos e Inventario**: `Product`/`Supplier`/
      `Purchase`/`PurchaseItem` tenant-scoped. Primer módulo opcional
      gateado de verdad por `FeatureFlagGuard`/`@RequiresFeature('inventory')`
      (Etapa 4 — infraestructura sin consumidor real hasta ahora): sin el
      flag habilitado, 403 en todo el módulo, sin importar permisos. CRUD
      de productos con SKU único por tenant, ajuste manual de stock,
      alerta de stock mínimo (`?lowStock=true`), proveedores, y compras
      (`pending` no toca stock, `receive` lo incrementa y actualiza el
      costo en una transacción). Reusa los permisos
      `productos.gestionar`/`inventario.gestionar` ya sembrados desde la
      Etapa 2. 95 tests en la suite completa (10 nuevos). Detalle en
      `docs/15-PRODUCTOS-INVENTARIO.md`.
- [x] **Etapa 12 — Ventas + Caja + Gastos + Comisiones**:
      `CashRegister`/`Sale`/`SaleItem`/`SalePayment`/`Expense`
      tenant-scoped. Ventas mixtas (servicios+productos) con precio
      SIEMPRE del catálogo (nunca del cliente), pagos combinados (la suma
      tiene que dar el total exacto), descuento y reposición de stock
      transaccional. Caja: un único registro abierto por sucursal,
      arqueo real al cerrar (efectivo declarado + ventas en efectivo −
      gastos, contra lo contado a mano). Comisiones calculadas al vuelo
      sobre el subtotal de servicios de cada profesional
      (`Professional.commissionPercentage`, Etapa 7, sin uso hasta
      ahora). Reusa los permisos `ventas.*`/`caja.*`/`reportes.ver`
      sembrados desde la Etapa 2; nuevos `gastos.ver/crear`. 105 tests en
      la suite completa (10 nuevos). Detalle en
      `docs/16-VENTAS-CAJA-GASTOS-COMISIONES.md`.
- [x] **Etapa 13 — Fidelización (Puntos, Promociones, Gift Cards,
      Referidos)**: `LoyaltyPointsTransaction`/`GiftCard`/
      `GiftCardTransaction`/`Referral`/`Promotion` tenant-scoped, cuatro
      módulos independientes cada uno detrás de su propio Feature Flag
      (`points`/`gift_cards`/`referrals`/`promotions` — el último no
      estaba sembrado, se agregó en esta etapa). Puntos: otorgar/canjear
      contra un ledger inmutable (`Client.loyaltyPoints` es el saldo
      cacheado). Gift cards: código propio o autogenerado (único por
      tenant), canje parcial con cierre automático al llegar a $0,
      cancelación, rechazo de canje vencido. Referidos: único por
      cliente referido por negocio, `complete` acredita puntos de
      recompensa al referente reusando el ledger de Puntos. Promociones:
      CRUD puro, código único por tenant. Sin ningún hook automático
      desde `Sale` (Etapa 12) en esta etapa — todo por endpoint
      explícito. Permisos nuevos `puntos.gestionar`/`giftcards.gestionar`/
      `referidos.gestionar`/`promociones.gestionar`. 119 tests en la
      suite completa (14 nuevos). Detalle en `docs/17-FIDELIZACION.md`.
- [x] **Etapa 14 — Notificaciones (centro + canales internos)**:
      `Notification` (buzón propio de cada `User`) + `CommunicationRead`
      (marca de lectura, sin duplicar la Comunicación por usuario —
      resuelta en runtime igual que Feature Flags). `GET /notifications`
      combina notificaciones propias + Comunicaciones globales (Etapa 3)
      aplicables por audiencia. Dos disparadores internos: stock bajo
      (cruce hacia `stock <= minStock`, desde `ProductsService.adjustStock`
      y `SalesService.create`, solo a usuarios con `inventario.gestionar`)
      y aviso de límite de plan al cruzar 75%/90% (desde
      `PlanLimitsService.assertCanCreate`, sin persistir "ya avisé" —
      se deduce de la aritmética del conteo, solo a `suscripcion.gestionar`).
      `NotificationsService` es un singleton sin `TenantPrismaService` a
      propósito (evita forzar a `PlanLimitsGuard` a volverse
      request-scoped). 127 tests en la suite completa (8 nuevos). Detalle
      en `docs/18-NOTIFICACIONES.md`.
- [ ] **Etapa 15 — Mercado Pago para clientes**: señas, pago de servicios/
      productos, checkout, webhooks, conciliación con Ventas/Turnos.
- [ ] **Etapa 16 — WhatsApp (Meta Cloud API)**: conexión de cuenta,
      confirmaciones/recordatorios/cancelaciones, flujo de reserva por chat.
- [ ] **Etapa 17 — Instagram / Facebook (Meta)**.
- [ ] **Etapa 18 — Página pública + QR + PWA**.
- [ ] **Etapa 19 — Sucursales (multi-sucursal completo)**: permisos por
      sucursal, caja/inventario por sucursal.
- [ ] **Etapa 20 — Dashboard, Estadísticas y Reportes (PDF/CSV/Excel)**.
- [ ] **Etapa 21 — IA (opcional)**.
- [ ] **Etapa 22 — Auditoría avanzada y Observabilidad** (dashboards de
      logs/métricas, más allá del `AuditLog` ya modelado en Etapa 1).
- [ ] **Etapa 23 — Seguridad hardening**: RLS de Postgres activado (ver doc
      `02`), pentest interno (checklist del doc `04` sección 10). El rate
      limiting global ya se implementó en la Etapa 3 (`@nestjs/throttler`).
- [ ] **Etapa 24 — Backups**: automatización, verificación por restauración
      real (no solo "se generó el archivo"), registro de backups.
- [ ] **Etapa 25 — Testing end-to-end y de carga**: escenarios de
      escalabilidad (10 → 10.000 negocios simulados).
- [ ] **Etapa 26 — Deploy y Documentación final**.

## Próxima acción concreta

Continuar con la Etapa 15 del roadmap: Mercado Pago para clientes (señas,
pago de servicios/productos, checkout, webhooks, conciliación con Ventas/
Turnos).
