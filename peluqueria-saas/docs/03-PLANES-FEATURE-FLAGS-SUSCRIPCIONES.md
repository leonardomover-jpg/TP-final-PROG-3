# 03 — Planes, Feature Flags y Suscripciones

## 1. Qué problema resuelve

Determina **qué puede usar cada negocio** (límites cuantitativos y
funcionalidades habilitadas) y **si su cuenta está al día** con la
plataforma. Es el módulo que conecta el modelo de negocio del SaaS (cobrar
por plan) con el comportamiento real de la aplicación.

## 2. Dependencias

Depende de: Tenant, PlatformAdmin (doc `02`). Es requisito de: absolutamente
todos los módulos opcionales (Capa 3 y 4 del doc `01`) y del propio acceso al
sistema (una suscripción vencida degrada el acceso).

## 3. Jerarquía de Feature Flags (punto 10-12 del pedido)

```
SUPER ADMIN         (catálogo global + on/off por flag, plataforma entera)
      ↓
PLAN                (qué flags incluye cada plan contratable)
      ↓
NEGOCIO             (de los flags que su plan permite, cuáles tiene prendidos)
```

Reglas de resolución (evaluadas siempre en este orden, nunca al revés):

```
flag deshabilitado en SUPER ADMIN   → NO disponible para nadie, sin excepción
flag habilitado en SUPER ADMIN
  + NO incluido en el Plan          → NO disponible para ese negocio
flag habilitado en SUPER ADMIN
  + incluido en el Plan             → el negocio PUEDE activarlo/desactivarlo
```

Un negocio nunca puede activar un flag que su plan no incluye, ni aunque el
flag esté globalmente habilitado — eso se vende como upgrade de plan, no
como toggle.

## 4. Modelo de datos

### 4.1 FeatureFlag (catálogo global)

```
FeatureFlag
 ├── id
 ├── key            (ej. "points", "gift_cards", "whatsapp", "ai", "branches")
 ├── name
 ├── description
 ├── globallyEnabled  (switch maestro del SUPER ADMIN)
 ├── dependsOnKey     (nullable, ej. "gift_cards" no depende de nada, "whatsapp"
 │                     podría depender de una integración configurada — ver 4.5)
 └── createdAt / updatedAt
```

### 4.2 Plan

```
Plan
 ├── id
 ├── name              (ej. "Básico", "Profesional", "Premium", "Empresa" — editable)
 ├── price
 ├── billingPeriod      (monthly | yearly)
 ├── maxUsers
 ├── maxProfessionals
 ├── maxBranches
 ├── maxClients
 ├── status            (active | archived — no se borra un plan con tenants activos)
 └── createdAt / updatedAt
```

Todo lo listado (nombres, precios, límites) es editable desde SUPER ADMIN en
runtime — nunca hardcodeado en el código (punto 84 del pedido, y principio
95: centralizar en un `PlanService`, no si/else repetidos).

### 4.3 PlanFeature (qué flags incluye cada plan)

```
PlanFeature
 ├── planId → Plan
 └── featureFlagId → FeatureFlag
 @@unique([planId, featureFlagId])
```

### 4.4 TenantFeatureFlag (qué flags tiene prendidos cada negocio)

```
TenantFeatureFlag
 ├── tenantId → Tenant
 ├── featureFlagId → FeatureFlag
 ├── enabled          (decisión del propio negocio, dentro de lo que su plan permite)
 └── updatedAt
 @@unique([tenantId, featureFlagId])
```

Importante: esta tabla **nunca se borra** cuando el negocio apaga un módulo
(punto 11 del pedido: no perder histórico) — solo cambia `enabled` a
`false`. Los datos de negocio del módulo (ej. puntos acumulados) viven en
sus propias tablas de la Capa 3, completamente independientes de este flag;
apagar el flag solo oculta UI/desactiva jobs, nunca borra filas.

### 4.5 Dependencias entre módulos (punto 12 del pedido)

Se modelan en dos niveles:

- **Dependencia entre flags** (`FeatureFlag.dependsOnKey`): ej. si en el
  futuro se agrega un flag compuesto, se puede expresar que un flag requiere
  otro flag activo.
- **Dependencia de integración externa** (no es un flag, es estado de
  conexión): WhatsApp y Mercado Pago dependen de que el negocio haya
  conectado su cuenta (`TenantIntegration` — se diseña en la etapa de
  integraciones, no en esta). El `FeatureGuard` (ver 4.6) evalúa ambas cosas
  y devuelve un motivo específico:
  ```
  "El módulo WhatsApp requiere conectar una cuenta de WhatsApp Business."
  "El módulo Puntos no está incluido en tu plan actual (Básico)."
  "Este módulo fue deshabilitado por la plataforma."
  ```
  (cumple el punto 12: "mostrar claramente el motivo").

### 4.6 Resolución centralizada (evita `if plan == premium` repetido — punto 95)

Un único `FeatureFlagService.isEnabled(tenantId, flagKey)` encapsula toda la
jerarquía de la sección 3, y un `FeatureFlagGuard` de NestJS lo usa como
decorador (`@RequiresFeature('points')`) sobre cualquier endpoint. Ningún
controller vuelve a evaluar esta lógica a mano.

### 4.7 Subscription (suscripción del negocio a la plataforma)

```
Subscription
 ├── id
 ├── tenantId → Tenant           -- @@unique (un negocio tiene una suscripción activa a la vez)
 ├── planId → Plan
 ├── status        (trial | active | past_due | expiring_soon | suspended | cancelled)
 ├── trialEndsAt
 ├── currentPeriodStart / currentPeriodEnd
 ├── cancelAtPeriodEnd
 └── createdAt / updatedAt
```

- `expiring_soon` se deriva calculando contra la fecha del **servidor**
  (`currentPeriodEnd - now() <= 5 días`), nunca contra un valor mandado por
  el cliente (punto 13 del pedido).
- El cambio de `status` a `active`/`past_due` lo dispara **solo** el webhook
  de Mercado Pago procesado en backend (ver `SubscriptionPayment` abajo),
  nunca una respuesta del frontend (punto 14).

### 4.8 SubscriptionPayment (historial de pagos de la suscripción)

```
SubscriptionPayment
 ├── id
 ├── subscriptionId → Subscription
 ├── provider           ("mercado_pago")
 ├── providerPaymentId   -- @@unique([provider, providerPaymentId]) → garantiza idempotencia de webhooks
 ├── amount / currency
 ├── status             (pending | approved | rejected | refunded)
 ├── rawPayload          (JSON crudo del webhook, para auditoría/debug)
 └── createdAt
```

El `@@unique([provider, providerPaymentId])` es la pieza clave de
idempotencia: un webhook reenviado por Mercado Pago (que puede llegar más de
una vez, punto 65 del pedido) se procesa una sola vez porque el segundo
intento de insert falla por constraint y el handler lo trata como "ya
procesado", no como error.

## 5. Comportamiento cuando el negocio desactiva un módulo (punto 11)

Definido explícitamente para que ninguna implementación futura lo pase por
alto:

1. `TenantFeatureFlag.enabled = false`.
2. El menú/dashboard del frontend deja de listar el módulo (consulta el
   mismo `FeatureFlagService`).
3. Los jobs en cola relacionados (ej. recordatorio con promoción de puntos)
   se filtran por flag activo antes de ejecutarse — nunca se encolan si el
   flag está apagado, y si ya estaban encolados al momento del apagado, el
   worker vuelve a chequear el flag antes de procesar y descarta el job.
4. Las tablas de datos del módulo (ej. `LoyaltyPointsBalance`,
   `LoyaltyPointsTransaction` — a diseñar en su etapa) **no se tocan**.
5. Al reactivar, el negocio ve exactamente el historial que tenía.

## 6. Riesgos de seguridad específicos

- Un negocio no debe poder escribir directamente en `TenantFeatureFlag` un
  `featureFlagId` que su plan no incluye — el service valida plan→flag antes
  de aceptar el toggle, no confía en que el frontend "no muestre" la opción.
- Los endpoints de `Plan`/`FeatureFlag` (catálogo global) son exclusivos de
  SUPER ADMIN — un token de negocio nunca debe poder alcanzarlos aunque
  adivine la ruta (`/api/v1/admin/*` separado y protegido por un guard
  distinto al de negocio, no reutiliza el `PermissionsGuard` de tenant).
