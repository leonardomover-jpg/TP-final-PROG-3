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
- [ ] **Etapa 3 — SUPER ADMIN (panel y API separados)**: CRUD de negocios,
      suspender/reactivar, búsqueda/filtro, auditoría y logs visibles,
      comunicaciones globales, soporte (tickets) básico.
- [ ] **Etapa 4 — Planes y Feature Flags (código)**: `PlanService`,
      `FeatureFlagService`, `FeatureFlagGuard`, `PlanLimitsGuard`, panel de
      SUPER ADMIN para editar planes/flags.
- [ ] **Etapa 5 — Suscripciones + Mercado Pago (billing de la plataforma)**:
      checkout de suscripción, webhooks, estados (trial/activa/vencida),
      idempotencia, historial de pagos.
- [ ] **Etapa 6 — Clientes (CRM)**: alta/edición, ficha con historial
      (placeholder hasta que existan Turnos/Ventas), notas internas,
      soft delete.
- [ ] **Etapa 7 — Profesionales**: alta/edición, especialidades, horarios
      propios, comisión, vínculo opcional a `User`.
- [ ] **Etapa 8 — Servicios**: alta/edición, categorías, duración/precio,
      profesionales habilitados.
- [ ] **Etapa 9 — Horarios**: horario del negocio, horario por profesional,
      excepciones, feriados argentinos (con override manual por negocio).
- [ ] **Etapa 10 — Agenda y Turnos**: vistas día/semana/mes/lista, motor de
      disponibilidad (sin superposiciones), estados del turno, lista de
      espera, señas (dependiente de Mercado Pago para clientes — Etapa 15),
      control de no-shows.
- [ ] **Etapa 11 — Productos e Inventario**: alta de productos, stock,
      alertas de stock mínimo, proveedores, compras.
- [ ] **Etapa 12 — Ventas + Caja + Gastos + Comisiones**: ventas mixtas
      (servicios+productos), pagos combinados, apertura/cierre de caja con
      arqueo, gastos categorizados, cálculo de comisiones.
- [ ] **Etapa 13 — Fidelización (Puntos, Promociones, Gift Cards,
      Referidos)**: todos detrás de sus Feature Flags respectivos.
- [ ] **Etapa 14 — Notificaciones (centro + canales internos)**.
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
      `02`), pentest interno (checklist del doc `04` sección 10), rate
      limiting global.
- [ ] **Etapa 24 — Backups**: automatización, verificación por restauración
      real (no solo "se generó el archivo"), registro de backups.
- [ ] **Etapa 25 — Testing end-to-end y de carga**: escenarios de
      escalabilidad (10 → 10.000 negocios simulados).
- [ ] **Etapa 26 — Deploy y Documentación final**.

## Próxima acción concreta

Al confirmar esta Etapa 1, la Etapa 2 arranca con:

1. Setup del proyecto NestJS + Prisma en `peluqueria-saas/backend/` sobre el
   `schema.prisma` ya diseñado.
2. Migraciones iniciales (`prisma migrate dev`).
3. Módulo `auth` (login, refresh, hash de password, MFA opcional).
4. Módulo `tenancy` (middleware de resolución de tenant + Prisma extension
   de filtrado automático).
5. Módulo `users` + `roles` (CRUD + asignación de permisos).
6. Seeders de permisos de sistema y roles predefinidos.
7. Tests de aislamiento multi-tenant (el primero: "Tenant A no puede leer
   datos de Tenant B").
