# 01 — Análisis de Módulos y Arquitectura General

## 1. Qué problema resuelve el sistema

Un negocio de peluquería/barbería hoy gestiona turnos, clientes, stock, caja
y comisiones con herramientas sueltas (WhatsApp manual, planillas, cuadernos,
agendas de papel o apps genéricas de turnos). El objetivo de esta plataforma
es reemplazar todo eso por un sistema único, donde **cada negocio opera de
forma aislada** (multi-tenant) pero la plataforma entera es administrada
centralmente por un SUPER ADMIN que controla planes, funcionalidades y
facturación del propio SaaS.

## 2. Inventario de módulos y agrupación por capas

Agrupar los ~50 módulos del pedido en capas ayuda a que el código no termine
en "un monolito desordenado" (requisito explícito). Cada capa es un límite
de responsabilidad; los módulos de negocio nunca deberían necesitar conocer
detalles internos de la capa de plataforma, y viceversa.

```
CAPA 0 — PLATAFORMA (fuera de cualquier tenant, solo SUPER ADMIN)
 ├── Gestión de negocios (tenants)
 ├── Planes de suscripción
 ├── Feature Flags (catálogo global)
 ├── Suscripciones y pagos del SaaS (Mercado Pago)
 ├── Comunicaciones globales
 ├── Soporte (tickets)
 ├── Auditoría global / logs / observabilidad
 └── Seguridad y backups de plataforma

CAPA 1 — IDENTIDAD Y ACCESO (transversal, pero siempre resuelta contra 1 tenant)
 ├── Usuarios
 ├── Roles y permisos (RBAC)
 ├── Autenticación (JWT, sesiones, MFA para SUPER ADMIN)
 └── Multi-tenancy (resolución de tenant + aislamiento de datos)

CAPA 2 — OPERACIÓN DEL NEGOCIO (siempre tenant-scoped)
 ├── Sucursales
 ├── Horarios (negocio, profesional, excepciones, feriados)
 ├── Servicios
 ├── Profesionales
 ├── Clientes (CRM + historial)
 ├── Agenda / Turnos (+ superposición, lista de espera, señas, no-show)
 ├── Productos
 ├── Inventario (+ proveedores + compras)
 ├── Ventas (+ pagos mixtos)
 ├── Caja
 ├── Gastos
 └── Comisiones

CAPA 3 — FIDELIZACIÓN Y CRECIMIENTO (todos opcionales vía Feature Flags)
 ├── Puntos
 ├── Promociones
 ├── Gift Cards
 └── Referidos

CAPA 4 — CANALES E INTEGRACIONES EXTERNAS (encapsuladas, oficiales únicamente)
 ├── Mercado Pago (cobros a clientes: señas/servicios/productos)
 ├── WhatsApp (Meta Cloud API)
 ├── Instagram / Facebook (Meta Graph API)
 ├── Página pública + QR
 └── PWA

CAPA 5 — INTELIGENCIA Y REPORTES
 ├── Dashboard
 ├── Estadísticas
 ├── Reportes (PDF/CSV/Excel)
 └── IA (opcional, nunca cruza tenants)

CAPA TRANSVERSAL — SERVICIOS DE PLATAFORMA (usados por todas las capas)
 ├── Notificaciones (centro de notificaciones + canales)
 ├── Auditoría (registro de acciones)
 ├── Jobs en background (colas)
 ├── Almacenamiento (archivos/imágenes)
 ├── Logs / Observabilidad
 ├── Facturación (preparado, sin implementar fiscal todavía)
 └── i18n / moneda / zona horaria
```

## 3. Grafo de dependencias entre módulos

Notación: `A → B` significa "A necesita que B exista y esté disponible".
`[flag: x]` indica que el módulo solo se activa si el Feature Flag `x` está
habilitado en la jerarquía SUPER ADMIN → Plan → Negocio (ver doc 03).

```
Tenant (negocio)                     → (raíz, no depende de nada de negocio)
Usuarios                             → Tenant
Roles/Permisos                       → Usuarios
SUPER ADMIN                          → (tabla propia, fuera del tenant)
Planes                               → SUPER ADMIN
Feature Flags                        → Planes, SUPER ADMIN
Suscripciones                        → Tenant, Planes, Mercado Pago
Sucursales                           → Tenant                              [flag: branches]
Horarios                             → Tenant, Sucursales (opcional)
Servicios                            → Tenant
Profesionales                        → Tenant, Servicios, Horarios, Sucursales
Clientes                             → Tenant
Turnos / Agenda                      → Clientes, Profesionales, Servicios, Horarios
Lista de espera                      → Turnos
Señas                                → Turnos, Mercado Pago
Productos                            → Tenant
Inventario                           → Productos                           [flag: inventory]
Proveedores / Compras                → Inventario
Ventas                               → Clientes, Servicios, Productos, Caja
Caja                                 → Tenant, Sucursales
Gastos                               → Caja
Comisiones                           → Profesionales, Ventas
Puntos                               → Clientes, Ventas                    [flag: points]
Gift Cards                           → Clientes, Ventas                    [flag: gift_cards]
Referidos                            → Clientes                            [flag: referrals]
Promociones                          → Servicios, Productos, Clientes
WhatsApp                             → Turnos, Clientes  [flag: whatsapp] [cuenta Meta conectada]
Instagram / Facebook                 → Clientes [flag: instagram|facebook] [cuenta Meta conectada]
Página pública / QR                  → Tenant, Servicios, Profesionales, Horarios
PWA                                  → Página pública, Turnos
Dashboard / Estadísticas / Reportes  → Ventas, Turnos, Caja, Inventario
IA                                   → Estadísticas, Clientes              [flag: ai]
Auditoría, Notificaciones, Jobs      → transversal a todo lo anterior
```

Este grafo determina el orden de implementación real (ver
`06-ROADMAP-ETAPAS.md`): no se puede construir Turnos sin Clientes,
Profesionales, Servicios y Horarios; no se puede construir Comisiones sin
Ventas y Profesionales; ningún módulo de Capa 3/4 tiene sentido sin
Feature Flags (Capa 0) resuelto primero.

## 4. Separación conceptual de la arquitectura

```
┌─────────────────────────────────────────────────────────────────┐
│  FRONTEND (React + Vite + PWA)                                   │
│  - Panel SUPER ADMIN (app separada / rutas separadas)             │
│  - Panel del negocio (multi-tenant, resuelto por subdominio/token)│
│  - Página pública por negocio                                    │
└───────────────────────────────┬───────────────────────────────────┘
                                 │ HTTPS / REST (JSON) versionado /api/v1
┌───────────────────────────────▼───────────────────────────────────┐
│  API (NestJS)                                                     │
│  ┌───────────────┐ ┌───────────────┐ ┌───────────────────────┐   │
│  │ AuthN Guard   │ │ TenantGuard   │ │ PermissionsGuard (RBAC)│   │
│  └───────────────┘ └───────────────┘ └───────────────────────┘   │
│  ┌───────────────┐ ┌───────────────┐ ┌───────────────────────┐   │
│  │ FeatureFlag   │ │ PlanLimits    │ │ Módulos de negocio     │   │
│  │ Guard         │ │ Guard         │ │ (Capas 2-5)            │   │
│  └───────────────┘ └───────────────┘ └───────────────────────┘   │
└───────┬─────────────────┬─────────────────┬─────────────────┬────┘
        │                 │                 │                 │
┌───────▼──────┐  ┌───────▼───────┐ ┌───────▼───────┐ ┌───────▼───────┐
│ PostgreSQL   │  │ Redis + BullMQ│ │ Servicios      │ │ Almacenamiento │
│ (Prisma)     │  │ (jobs, colas) │ │ externos       │ │ (S3-compatible)│
│ tenant_id +  │  │ recordatorios,│ │ MercadoPago/    │ │ imágenes, PDFs │
│ RLS opcional │  │ webhooks, IA  │ │ Meta/WhatsApp   │ │                │
└──────────────┘  └───────────────┘ └───────────────┘ └───────────────┘
```

Puntos clave de esta separación:

- **Backend modular por dominio** (no por capa técnica): cada módulo de
  negocio (`clients`, `appointments`, `sales`, ...) es un módulo NestJS
  autocontenido con su propio controller/service/repository/DTOs. Los
  módulos se registran en un `AppModule` raíz; agregar un módulo nuevo
  (ej. `feature_memberships` del punto 98 del pedido) no debería requerir
  tocar los módulos existentes.
- **Guards como puntos únicos de decisión**: autenticación, resolución de
  tenant, permisos, feature flags y límites de plan se resuelven en guards
  reutilizables, nunca duplicados con `if` sueltos dentro de cada
  controller (ver doc `03` y `04`, y punto 95 del pedido).
- **Servicios externos encapsulados**: todo proveedor externo vive detrás de
  una interfaz propia (`PaymentProviderService`, `MessagingProviderService`,
  `StorageService`) para poder cambiar de proveedor sin tocar el dominio
  (punto 93).
- **Jobs fuera del ciclo de request/response**: recordatorios de WhatsApp,
  procesamiento de webhooks, cálculo de reportes pesados y vencimiento de
  suscripciones corren en workers de BullMQ, nunca bloqueando una petición
  HTTP (punto 66).

## 5. Stack tecnológico propuesto y justificación

| Capa | Elección | Por qué |
|---|---|---|
| Backend | Node.js 20 + TypeScript + **NestJS** | Arquitectura modular por convención (Modules/Providers), Guards/Interceptors nativos ideales para RBAC + tenancy + feature flags sin repetir lógica, DI para poder mockear servicios externos en tests |
| ORM / DB | **PostgreSQL + Prisma** | Migraciones versionadas obligatorias (punto 85), tipado fuerte end-to-end, soporta índices/constraints compuestos necesarios para aislamiento por tenant |
| Multi-tenancy | Base compartida + `tenant_id` + enforcement en middleware/guard, con **Postgres RLS** como capa adicional | Escala a miles de tenants sin explosión de conexiones/migraciones por tenant (requisito de 10 → 10.000 negocios); ver doc `02` |
| Jobs | **Redis + BullMQ** | Reintentos, backoff, colas separadas por tipo de trabajo (recordatorios, webhooks, reportes) |
| Frontend | **React + TypeScript + Vite** + Tailwind | SPA rápida, PWA-ready (`vite-plugin-pwa`), ecosistema maduro para formularios/tablas |
| Realtime | Socket.io (opcional, agenda en vivo) | Ya usado en el otro proyecto del repo, bajo costo de adopción |
| Pagos | **SDK oficial de Mercado Pago** | Punto 94: nunca inventar endpoints; Checkout Pro/Bricks + Webhooks oficiales |
| Mensajería | **WhatsApp Business Platform (Cloud API) / Meta Graph API** | Único mecanismo permitido por el pedido (puntos 43-47, 94); nada de scraping ni WhatsApp Web automatizado |
| Almacenamiento | Interfaz `StorageService` sobre S3-compatible (AWS S3 / MinIO / Spaces) | Evita lock-in de proveedor (punto 93) |
| Auth | JWT (access + refresh) + Argon2/bcrypt + MFA (TOTP) obligatorio para SUPER ADMIN | Estándar de la industria, soporta rotación y expiración de sesiones |

Esta elección de stack es una decisión de arquitectura, no un requisito
explícito del pedido — queda documentada acá para que cualquier cambio de
stack en el futuro sea una decisión consciente, no un accidente por
inconsistencia entre etapas.

## 6. Qué NO se hace en esta etapa

- No hay controllers, services ni endpoints de negocio implementados.
- No hay frontend implementado.
- No hay integraciones externas conectadas (Mercado Pago, Meta, etc.).
- Solo se definió: análisis, arquitectura, estrategia multi-tenant y el
  `schema.prisma` fundacional (tenants, usuarios, roles, permisos, planes,
  feature flags, suscripciones, auditoría) — ver docs `02` y `03`.
