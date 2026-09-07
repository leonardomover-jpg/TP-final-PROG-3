# Prompt Maestro — SaaS para Peluquerías, Barberías y Salones

Plataforma SaaS multi-tenant para gestión integral de peluquerías, barberías y
salones de belleza (agenda, clientes, ventas, inventario, fidelización,
WhatsApp/Meta, Mercado Pago, panel SUPER ADMIN, etc.).

Este directorio es un **proyecto nuevo e independiente** del Stock Manager
(TIF de PROG-3) que vive en `../backend` y `../frontend` en la raíz del
repositorio — no comparten código, base de datos ni dependencias.

## Estado actual: Etapa 1 — Análisis y Arquitectura

Siguiendo la metodología por etapas definida por el cliente (no se genera
código de negocio de una sola vez), esta primera entrega cubre **solo**:

1. Análisis de módulos y sus dependencias.
2. Arquitectura general del sistema.
3. Estrategia de multi-tenancy.
4. Diseño de base de datos **fundacional** (tenants, usuarios, roles y
   permisos, planes, feature flags, suscripciones, auditoría) — el resto de
   los módulos de negocio (clientes, turnos, ventas, inventario, etc.) se
   diseñarán en las etapas siguientes, en el orden definido en
   [`docs/06-ROADMAP-ETAPAS.md`](docs/06-ROADMAP-ETAPAS.md).
5. Riesgos y funcionalidades detectadas que no estaban explícitas en el
   pedido original.

No hay código de controllers/servicios de negocio todavía — solo el
`schema.prisma` fundacional (diseño de datos) en `backend/prisma/schema.prisma`.

## Documentos

| Doc | Contenido |
|---|---|
| [`docs/01-ANALISIS-Y-ARQUITECTURA.md`](docs/01-ANALISIS-Y-ARQUITECTURA.md) | Módulos, dependencias entre módulos, arquitectura general, stack tecnológico y justificación |
| [`docs/02-MULTI-TENANCY-Y-BASE-DE-DATOS.md`](docs/02-MULTI-TENANCY-Y-BASE-DE-DATOS.md) | Estrategia de aislamiento por tenant y diseño de las tablas fundacionales |
| [`docs/03-PLANES-FEATURE-FLAGS-SUSCRIPCIONES.md`](docs/03-PLANES-FEATURE-FLAGS-SUSCRIPCIONES.md) | Jerarquía SUPER ADMIN → Plan → Negocio, modelo de datos de planes/flags/suscripciones |
| [`docs/04-SEGURIDAD-BASELINE.md`](docs/04-SEGURIDAD-BASELINE.md) | Principios de seguridad transversales que todo módulo futuro debe cumplir |
| [`docs/05-OBSERVACIONES-Y-RIESGOS.md`](docs/05-OBSERVACIONES-Y-RIESGOS.md) | Funcionalidades/decisiones no explícitas en el pedido original, señaladas antes de implementar |
| [`docs/06-ROADMAP-ETAPAS.md`](docs/06-ROADMAP-ETAPAS.md) | Orden de las próximas etapas y checklist de revisión por etapa |

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

Continuar con la Etapa 2 del roadmap: Autenticación + Usuarios + RBAC +
Multi-tenancy (implementación de código sobre el schema fundacional ya
diseñado), según el detalle de `docs/06-ROADMAP-ETAPAS.md`.
