# 02 — Multi-tenancy y Base de Datos Fundacional

## 1. Qué problema resuelve

Cada negocio (tenant) debe estar completamente aislado de los demás: un
usuario de la Barbería A nunca debe poder leer ni modificar datos de la
Peluquería C, ni siquiera explotando un bug de frontend o manipulando un ID
en la URL (IDOR). Este documento define **cómo** se garantiza ese
aislamiento a nivel de datos y backend, y el diseño de las tablas que todo
lo demás (Capas 1-5) va a referenciar.

## 2. Dependencias

Depende de: nada (es la base de todo el sistema). Todo lo demás depende de
esto — ver grafo en doc `01`.

## 3. Estrategia de aislamiento elegida: base compartida + `tenant_id`

Se evaluaron 3 estrategias:

| Estrategia | Aislamiento | Costo operativo a 1.000-10.000 tenants | Migraciones |
|---|---|---|---|
| Una base de datos por tenant | Máximo | Inviable: miles de conexiones/bases, backups y migraciones por tenant | 1 por tenant (N migraciones por deploy) |
| Un schema por tenant (misma base) | Alto | Se degrada mal pasados unos cientos de tenants (catálogos de Postgres, planificación de queries) | 1 por schema (N por deploy) |
| **Base compartida + columna `tenant_id`** (elegida) | Alto, si se aplica en cada query | Escala horizontalmente sin fricción operativa | 1 sola migración para todos |

**Decisión:** base de datos compartida, con `tenant_id` como discriminador
en toda tabla tenant-scoped, reforzado en **dos capas independientes**:

1. **Capa de aplicación (obligatoria):** un `TenantContextMiddleware` extrae
   el tenant desde el JWT (o desde el subdominio en la página pública) y lo
   inyecta en un `AsyncLocalStorage`/request-scoped context. Un
   `PrismaService` extendido (Prisma Client Extensions) intercepta **toda**
   query sobre modelos tenant-scoped y agrega automáticamente
   `WHERE tenant_id = :tenantActual`, tanto en lecturas como en
   escrituras/updates/deletes. Ningún repository/service escribe el filtro
   de tenant a mano — se hereda del cliente Prisma inyectado por request.
2. **Capa de base de datos (defensa adicional, no reemplaza a la 1):**
   Postgres **Row-Level Security (RLS)** en las tablas tenant-scoped, con
   políticas que comparan `tenant_id` contra `current_setting('app.tenant_id')`,
   seteado por transacción. Si un bug futuro en la capa de aplicación olvida
   filtrar por tenant, RLS igual bloquea la fuga. Se implementa en la etapa
   de hardening de seguridad (ver roadmap), pero el diseño de tablas ya la
   contempla (todas las tablas tenant-scoped tienen `tenant_id NOT NULL`).

**Regla de oro (no negociable):** ningún controller ni service arma un
`WHERE` de tenant manualmente a partir de un parámetro de la request. El
`tenant_id` **nunca** viaja como parámetro de entrada del cliente — siempre
se resuelve del lado del servidor a partir de la sesión autenticada.

## 4. SUPER ADMIN vive fuera del modelo de tenant

Los usuarios de plataforma (SUPER ADMIN) **no** son filas de la tabla
`users` de un tenant. Viven en una tabla separada `platform_admins`, sin
`tenant_id`, con su propio flujo de auth (login separado, MFA obligatorio,
panel separado — puntos 7 y 8 del pedido). Esto evita que un bug de
autorización mezcle "admin de un negocio" con "admin de la plataforma".

## 5. Usuarios que trabajan en más de una sucursal (misma empresa)

Un `User` pertenece a **un único tenant** (no puede pertenecer a dos negocios
distintos con la misma cuenta — ver decisión explícita en doc `05`), pero
puede trabajar en **varias sucursales** de ese mismo negocio. Esto se modela
con una tabla puente `user_branches` (many-to-many), no con una FK única de
sucursal en `users`.

## 6. Diseño de tablas fundacionales

Convenciones aplicadas a todas las tablas:

- PK `id` tipo `String @id @default(cuid())` (evita IDs secuenciales
  adivinables → mitiga IDOR/enumeración).
- `createdAt` / `updatedAt` en todas las tablas.
- Soft delete (`deletedAt DateTime?`) en entidades donde se pide conservar
  historial (usuarios, y en etapas futuras: clientes, servicios, productos,
  profesionales — punto 97 del pedido). Las tablas puramente fundacionales
  de auth (roles, permisos) usan hard delete porque no tienen valor
  histórico por sí solas.
- `tenant_id` **no nulo** e indexado en toda tabla tenant-scoped; siempre
  como primer componente de los índices compuestos (la mayoría de las
  queries filtran primero por tenant).
- Unicidad **scoped al tenant**, no global: por ejemplo
  `@@unique([tenantId, email])` en `users`, no `@@unique([email])`. Dos
  negocios distintos pueden tener un usuario con el mismo email sin
  conflicto (ver justificación en doc `05`).

### 6.1 Tenant (negocio)

```
Tenant
 ├── id
 ├── name
 ├── slug            (único global — usado en subdominio/página pública)
 ├── status          (active | suspended | cancelled)  -- gestionado por SUPER ADMIN
 ├── timezone        (default: "America/Argentina/Buenos_Aires")
 ├── locale          (default: "es-AR")
 ├── currency        (default: "ARS")
 ├── createdAt / updatedAt / deletedAt
 └── planId → Plan (ver doc 03)
```

`slug` es único a nivel global (no por tenant, obviamente) porque define la
URL pública (`barberia-demo.tu-saas.com`, punto 50 del pedido).

### 6.2 Branch (sucursal) — soporta el caso de negocio con 1 sola sucursal

```
Branch
 ├── id
 ├── tenantId → Tenant
 ├── name
 ├── address
 ├── isMain          (la sucursal por defecto cuando el negocio no usa multi-sucursal)
 ├── status
 └── createdAt / updatedAt / deletedAt
```

Todo negocio tiene **al menos una** `Branch` (`isMain = true`) creada
automáticamente en el onboarding, incluso si el plan no incluye el feature
`branches` — así el resto del modelo (turnos, caja, inventario) siempre
referencia una sucursal sin `if (tenant.hasBranches)` esparcido por el
código (principio del punto 95).

### 6.3 User (usuario del negocio, tenant-scoped)

```
User
 ├── id
 ├── tenantId → Tenant
 ├── firstName / lastName
 ├── email                      -- @@unique([tenantId, email])
 ├── phone
 ├── passwordHash                -- Argon2id
 ├── status          (active | invited | suspended)
 ├── lastLoginAt
 ├── mfaEnabled / mfaSecret       (opcional para admins de negocio, obligatorio para SUPER ADMIN)
 ├── createdAt / updatedAt / deletedAt
 └── branches → UserBranch[]     (M:N con Branch)
```

### 6.4 Role / Permission / RolePermission / UserRole (RBAC)

```
Role
 ├── id
 ├── tenantId → Tenant            (null = rol de sistema, ej. "admin_negocio" predefinido)
 ├── name
 ├── isSystem       (true = rol predefinido, no editable/borrable por el negocio)
 └── createdAt / updatedAt

Permission                        -- catálogo GLOBAL, no tenant-scoped
 ├── id
 ├── key             (ej. "clientes.crear", "turnos.cancelar", "caja.cerrar")
 ├── module          (ej. "clientes", "turnos", "caja") -- agrupa para la UI de permisos
 └── description

RolePermission
 ├── roleId → Role
 └── permissionId → Permission

UserRole
 ├── userId → User
 └── roleId → Role
```

`Permission` es un catálogo fijo definido por el código (no lo crea el
negocio), pero `Role` sí lo crea/edita cada negocio combinando permisos
libremente (punto 6 del pedido: "el administrador... debería poder definir
permisos específicos"). Se proveen roles de sistema predefinidos
(`SUPER ADMIN` — en `platform_admins`, no acá —, `admin_negocio`,
`recepcionista`, `profesional`) que el negocio puede clonar y adaptar, pero
no borrar (`isSystem = true`).

### 6.5 UserBranch (M:N usuario ↔ sucursal)

```
UserBranch
 ├── userId → User
 └── branchId → Branch
 @@unique([userId, branchId])
```

### 6.6 PlatformAdmin (SUPER ADMIN, fuera del modelo de tenant)

```
PlatformAdmin
 ├── id
 ├── email           -- @@unique global
 ├── passwordHash
 ├── mfaEnabled       (obligatorio: se fuerza en el login, no opcional)
 ├── mfaSecret
 ├── status
 ├── lastLoginAt
 └── createdAt / updatedAt
```

### 6.7 AuditLog (auditoría transversal — punto 61)

```
AuditLog
 ├── id
 ├── tenantId          (nullable: null = acción de SUPER ADMIN sobre la plataforma)
 ├── actorType          (user | platform_admin | system | webhook)
 ├── actorId
 ├── action             (ej. "service.price.updated", "user.login", "cash_register.closed")
 ├── entityType / entityId
 ├── beforeData / afterData   (JSON, para poder mostrar "antes: $8.000 / después: $10.000")
 ├── ipAddress / userAgent
 └── createdAt
```

Indexado por `(tenantId, createdAt)` y por `(entityType, entityId)` para
poder reconstruir el historial de una entidad puntual rápidamente.

## 7. Índices y constraints clave (resumen)

```
Tenant.slug                         UNIQUE
User            (tenantId, email)   UNIQUE, INDEX(tenantId)
Role            (tenantId, name)    UNIQUE, INDEX(tenantId)
UserRole        (userId, roleId)    UNIQUE
RolePermission  (roleId, permissionId) UNIQUE
UserBranch      (userId, branchId)  UNIQUE
Branch                              INDEX(tenantId)
AuditLog                            INDEX(tenantId, createdAt), INDEX(entityType, entityId)
PlatformAdmin.email                 UNIQUE
```

## 8. Riesgos de seguridad específicos de este módulo

- **IDOR entre tenants**: mitigado por el filtro automático de tenant en
  Prisma (capa 1) + RLS (capa 2). Se debe testear explícitamente "Tenant A
  intentando acceder a Tenant B" como pide el punto 73 del pedido — se
  documenta como test obligatorio en el roadmap de la etapa de
  autenticación/multi-tenancy.
- **Escalada de privilegios vía `RolePermission`**: el endpoint que asigna
  permisos a un rol debe validar que el usuario que hace el cambio tenga él
  mismo esos permisos (no se puede otorgar un permiso que uno no tiene).
- **Mass assignment**: los DTOs de creación/edición de `User`/`Role` nunca
  aceptan `tenantId` desde el cliente — se inyecta del contexto de sesión.

## 9. Qué queda para etapas siguientes

El resto de las tablas de negocio (Client, Service, Professional,
Appointment, Product, Sale, CashRegister, etc.) se diseñan en sus propias
etapas (ver `06-ROADMAP-ETAPAS.md`), todas heredando el mismo patrón:
`tenantId NOT NULL` + índice compuesto + soft delete donde aplique.
