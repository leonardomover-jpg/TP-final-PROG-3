# 08 — Planes y Feature Flags: código real (Etapa 4)

## 1. Qué problema resuelve

La Etapa 1 (doc `03`) diseñó el modelo de datos y la jerarquía SUPER ADMIN
→ Plan → Negocio. Esta etapa la vuelve código real: quién puede decidir qué,
resuelto en un único lugar, y aplicado de forma consistente en toda la API.

## 2. Dependencias

Depende de: `Tenant`, `Plan`, `FeatureFlag`, `PlanFeature`,
`TenantFeatureFlag` (ya existían desde la Etapa 1 — **no hizo falta ninguna
migración nueva en esta etapa**). Es requisito de: todo módulo opcional de
las etapas siguientes (Puntos, Gift Cards, WhatsApp, etc. — Capa 3/4 del doc
`01`), que se van a gatear con `@RequiresFeature('key')`.

## 3. FeatureFlagsService — único lugar que resuelve la jerarquía

`resolveOneForTenant(tenantId, key)` (y su variante `resolveAllForTenant`)
son el único código de todo el backend que decide si un negocio puede usar
un módulo. Nadie más vuelve a escribir esa lógica — ni un guard, ni un
controller, ni un service de negocio futuro.

```
flag.globallyEnabled = false          → available=false, "deshabilitado por la plataforma"
tenant.planId = null                  → available=false, "todavía no tiene un plan asignado"
flag fuera del PlanFeature del plan   → available=false, "no está incluido en tu plan actual"
flag disponible                       → available=true, enabled=según TenantFeatureFlag
```

`reason` solo se completa cuando `available` es `false`, para que el
frontend lo muestre tal cual (punto 12 del pedido).

**Nunca se borra la fila `TenantFeatureFlag`** al desactivar un módulo — se
hace `upsert` de `enabled` (punto 11 del pedido: conservar histórico).
Testeado explícitamente en `test/feature-flags.spec.ts`.

## 4. FeatureFlagGuard — infraestructura para las etapas siguientes

`@RequiresFeature('points')` + `@UseGuards(FeatureFlagGuard)` es el patrón
que van a usar los módulos opcionales de la Etapa 13 en adelante (Puntos,
Gift Cards, Referidos) y las integraciones de la 16/17 (WhatsApp, Instagram,
Facebook). Se construyó y se dejó exportado desde `FeatureFlagsModule` en
esta etapa porque el pedido lo pide como pieza central del sistema (punto
10), aunque todavía no hay un endpoint de negocio real que lo consuma — ese
consumo llega junto con cada módulo opcional.

## 5. PlanLimitsService / PlanLimitsGuard

Resuelve la pregunta que el doc `05` (§2) había señalado como no explícita
en el pedido original: "¿qué pasa cuando un negocio llega al límite de su
plan?". Respuesta: se bloquea la creación con un mensaje claro (`403`,
*"Alcanzaste el límite de 3 usuarios de tu plan actual. Mejorá tu plan para
agregar más."*), nunca un error genérico.

Ya está conectado a los dos recursos que existen hasta ahora:

- `@LimitResource('users')` en `POST /users`
- `@LimitResource('branches')` en `POST /branches`

`professionals` y `clients` se agregan cuando existan esos módulos (Etapa
6/7) — el tipo `LimitableResource` y el `switch` de
`PlanLimitsService.countCurrent`/`maxFor` ya están preparados para sumar un
caso más sin tocar nada de lo existente.

Un negocio sin plan asignado (`tenant.planId = null`) **no tiene límite
aplicado** (`max: null`) — no hay nada contra qué comparar todavía. Se
documenta como decisión de esta etapa: la Etapa 5 (Suscripciones) va a
forzar la selección de un plan durante el onboarding, momento en el que
este caso deja de darse en el flujo normal.

## 6. Gestión desde SUPER ADMIN

- `platform-admin/plans`: CRUD de planes (nombre, precio, periodicidad,
  límites) + `PATCH /:id/features` para definir qué módulos incluye cada
  plan. Nunca hay `DELETE` físico — un plan se archiva (`status=archived`,
  mismo patrón que `Role`/`FeatureFlag`) porque puede haber negocios
  referenciándolo.
- `platform-admin/feature-flags`: catálogo global — crear un módulo nuevo,
  editar nombre/descripción, prender/apagar `globallyEnabled`.
- `platform-admin/tenants/:id/plan` (nuevo en esta etapa): asignar o
  cambiar el plan de un negocio existente — necesario porque un negocio
  autoregistrado (`POST /auth/register-tenant`, Etapa 2) no elige plan en
  el momento del alta.

## 7. Del lado del negocio

- `GET /feature-flags` (permiso `feature_flags.ver`): lista todo el
  catálogo con `available`/`enabled`/`reason` resueltos para ESE negocio.
- `PATCH /feature-flags/:key` (permiso `feature_flags.gestionar`): activar/
  desactivar un módulo, solo si `available`.
- `GET /plan` (sin permiso especial — lectura de baja sensibilidad): plan
  actual + uso vs. límite de cada recurso limitable. Pensado para un futuro
  dashboard/onboarding.

## 8. Seed

`prisma/seed.ts` ahora también carga un catálogo inicial de 11 feature
flags (los mencionados en el punto 10 del pedido: `points`, `gift_cards`,
`referrals`, `whatsapp`, `instagram`, `facebook`, `ai`, `inventory`,
`branches`, `waitlist`, `advanced_reports`) y dos planes de ejemplo
(*Básico* y *Premium*) con límites y módulos distintos — para poder probar
la jerarquía completa apenas se instala la plataforma. Nombres, precios,
límites y qué incluye cada plan son 100% editables desde SUPER ADMIN
después (punto 84 del pedido); esto es solo el punto de partida, no algo
hardcodeado en el código.

## 9. Tests

`test/feature-flags.spec.ts` cubre exactamente los 4 casos que pide el
punto 74 del pedido (y que ya estaban anotados como pendientes en el
roadmap): negocio sin plan → todo no disponible; plan no incluye un flag →
no se puede activar; SUPER ADMIN deshabilita un flag global → nadie puede
usarlo aunque su plan lo incluya; desactivar un flag no borra la fila.
`test/plan-limits.spec.ts` cubre el bloqueo por límite de usuarios y de
sucursales, y el caso sin plan asignado (sin límite). 47 tests en total en
toda la suite (8 nuevos de esta etapa).
