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
      `02`), pentest interno (checklist del doc `04` sección 10). El rate
      limiting global ya se implementó en la Etapa 3 (`@nestjs/throttler`).
- [ ] **Etapa 24 — Backups**: automatización, verificación por restauración
      real (no solo "se generó el archivo"), registro de backups.
- [ ] **Etapa 25 — Testing end-to-end y de carga**: escenarios de
      escalabilidad (10 → 10.000 negocios simulados).
- [ ] **Etapa 26 — Deploy y Documentación final**.

## Próxima acción concreta

La Etapa 4 (Planes y Feature Flags — código real sobre el modelo ya
diseñado en la Etapa 1, doc `03`) arranca con:

1. `PlanService` + `FeatureFlagService` centralizados (doc `03` §4.6):
   resolución de la jerarquía SUPER ADMIN → Plan → Negocio en un único
   lugar, nada de `if plan === 'premium'` repetido por el código.
2. `FeatureFlagGuard` (decorador `@RequiresFeature('key')`) y
   `PlanLimitsGuard` (bloquea creación de usuarios/profesionales/sucursales/
   clientes por encima del límite del plan — doc `05` §2).
3. Endpoints de SUPER ADMIN para gestionar el catálogo de planes y feature
   flags (`platform-admin/plans`, `platform-admin/feature-flags`) — el
   modelo de datos y las reglas ya están, falta la API de gestión.
4. Endpoints de negocio para que el propio tenant vea sus flags disponibles
   y prenda/apague los que su plan permite (`TenantFeatureFlag`).
5. Tests: SUPER ADMIN deshabilita un flag global → ningún negocio puede
   usarlo aunque su plan lo incluya (punto 74 del pedido); plan no incluye
   un flag → el negocio no puede activarlo; negocio desactiva un flag → los
   datos históricos del módulo permanecen intactos.
