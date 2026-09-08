# 10 — Clientes / CRM (Etapa 6)

## 1. Qué problema resuelve

Es el primer módulo de negocio "de verdad": el registro de clientes del
negocio. Turnos (Etapa 10), Ventas (Etapa 12) y Fidelización (Etapa 13) van
a apuntar a `Client`, así que este modelo tenía que quedar bien definido
antes de esas etapas — el roadmap (doc `06`) ya lo ubicaba primero por eso.

## 2. Dependencias

Depende de: multi-tenancy (`TenantPrismaService`, Etapa 2), RBAC (permisos
`clientes.*`, ya seedeados desde la Etapa 2), Planes/límites
(`PlanLimitsService`, Etapa 4 — el `case 'clients'` ya estaba anticipado en
el `switch`, doc `08` §5). Es requisito de: Turnos, Ventas, Fidelización
(todas las etapas de negocio siguientes referencian `Client.id`).

## 3. Modelo de datos

```
Client
  id, tenantId, firstName, lastName, phone?, email?, birthDate?,
  notes? (observaciones generales, texto libre), status (active|inactive),
  createdAt, updatedAt, deletedAt (soft delete)

ClientNote
  id, clientId, authorId, body, createdAt
```

Decisiones de diseño:

- **Sin `@@unique` en `email`/`phone`** (a diferencia de `User`, que sí
  exige email único por tenant): un cliente no es una identidad de login,
  y los duplicados son plausibles en la práctica (un teléfono familiar
  compartido entre hermanos, por ejemplo). Forzar unicidad ahí generaría
  falsos rechazos en el alta.
- **`notes` (campo) vs. `ClientNote` (tabla)**: son cosas distintas a
  propósito. `notes` es un único campo de texto libre para "observaciones
  generales" (ej. "prefiere shampoo sin sulfatos"), mientras que
  `ClientNote` es un historial de entradas timestampeadas con autor —
  pensado para que varios empleados vayan dejando anotaciones a lo largo
  del tiempo sin pisarse el texto entre ellos.
- **Soft delete** (mismo patrón que `User`/`Branch`, punto 97 del pedido):
  `deletedAt` + `status: 'inactive'`. El historial de un cliente borrado
  se conserva — importante porque Turnos/Ventas futuros van a referenciar
  su `id` y no pueden quedar huérfanos.

## 4. Permisos

Se reutilizan los 4 permisos ya sembrados desde la Etapa 2 (nunca usados
hasta ahora, porque no existía el módulo): `clientes.ver`, `clientes.crear`,
`clientes.editar`, `clientes.eliminar`. Las notas internas se gatean con
los mismos permisos (`clientes.ver` para leer, `clientes.editar` para
agregar una nota) — no se introdujo un permiso granular nuevo ("quién
puede ver notas" vs. "quién puede ver datos personales") porque el pedido
no especifica esa distinción para Clientes (a diferencia, por ejemplo, de
Caja, donde sí hay permisos separados de apertura/cierre/ver movimientos).
Si en una etapa futura aparece un caso concreto que lo necesite, se agrega
ahí — no antes, para no adivinar un requisito no pedido (doc `05`).

## 5. Ficha del cliente (placeholder de historial)

`GET /clients/:id` devuelve, además de los datos personales y las notas:

```json
"history": { "appointments": [], "sales": [], "loyaltyPoints": null }
```

Es un placeholder **explícito**, no un campo olvidado: se completa recién
cuando existan los módulos de Turnos (Etapa 10), Ventas (Etapa 12) y
Fidelización (Etapa 13). Se documenta así en vez de omitir el campo para
que el frontend pueda construir la UI de la ficha desde ya, sabiendo que
esas listas van a empezar a llenarse en etapas futuras sin que cambie la
forma de la respuesta.

## 6. Endpoints

```
GET    /clients            clientes.ver
GET    /clients/:id        clientes.ver   (ficha completa: datos + notas + historial placeholder)
POST   /clients            clientes.crear (+ PlanLimitsGuard, @LimitResource('clients'))
PATCH  /clients/:id        clientes.editar
DELETE /clients/:id        clientes.eliminar (soft delete)
GET    /clients/:id/notes  clientes.ver
POST   /clients/:id/notes  clientes.editar
```

## 7. Multi-tenancy y límites de plan

`Client` se agregó a `tenant-scope.extension.ts` con el mismo patrón que
`User`/`Branch`: igualdad estricta de `tenantId` en cada find/update/
delete/create, sin que ningún service arme ese filtro a mano.
`ClientNote` **no** tiene `tenantId` propio (cuelga de `Client.tenantId`),
así que no se intercepta en la extensión — `ClientsService` valida que el
`Client` padre exista (ya filtrado por tenant) antes de leer o crear una
nota, así que un tenant nunca puede leer ni escribir notas de un cliente
ajeno aunque adivine el `clientId`.

`PlanLimitsService.LimitableResource` pasó de `'users' | 'branches'` a
incluir `'clients'` — el `switch` ya estaba preparado desde la Etapa 4
(comentario en `plan-limits.types.ts`), así que fue agregar un `case` en
`maxFor`/`countCurrent`, sin tocar el guard ni el decorator.

## 8. Qué NO se hizo en esta etapa (a propósito)

- **Importación masiva de clientes (CSV/Excel)**: útil para la migración
  de un negocio que ya tenía sus clientes en otro sistema, pero no es
  parte del CRUD básico — se deja para cuando exista un pedido concreto de
  ese flujo (o para la etapa de Reportes/Import-Export si el pedido la
  cubre ahí).
- **Búsqueda/filtro avanzado** (por nombre, teléfono, tags): `GET
  /clients` devuelve la lista completa activa del tenant, ordenada por
  fecha de creación. Con volúmenes grandes de clientes esto va a necesitar
  paginación y búsqueda — se deja para cuando el propio dato lo exija (un
  negocio con cientos de clientes), siguiendo el mismo criterio que
  `platform-admin/subscriptions` (paginado) ya usa como referencia.
- **Permiso separado para notas internas**: ver sección 4.

## 9. Tests

`test/clients.spec.ts`: CRUD completo (crear/listar/ver ficha/editar/soft
delete, con verificación de que la fila y su historial siguen en la base
después del borrado); ausencia de unicidad en email/teléfono; notas
internas (agregar, listar, aparecen en la ficha); aplicación real del
permiso `clientes.crear`; aislamiento multi-tenant completo (lista, `GET`/
`PATCH`/`DELETE` por id directo, y también notas — un tenant no puede leer
ni agregar notas de un cliente ajeno); límite de plan (`maxClients`)
bloqueando la creación de más clientes que el plan permite. 59 tests en la
suite completa (6 nuevos de esta etapa).

De paso, se corrigieron dos tests de la Etapa 5 (`test/subscriptions.spec.ts`)
que usaban un `dataId` de pago fijo (`'payment-999'`) y no dependían de la
página en la que cae una suscripción dentro de un listado paginado — contra
una base de datos de desarrollo que no se trunca entre corridas, ambos
patrones generaban falsos negativos al correr la suite más de una vez (la
segunda corrida encontraba el pago del intento anterior y lo trataba como
"ya procesado" desde el primer POST; el segundo test podía no encontrar la
suscripción recién creada si ya había más de una página de suscripciones
`trial` acumuladas). No es un bug de la aplicación — es un problema de
aislamiento de datos de test, corregido generando un `dataId` único por
corrida y consultando la suscripción por `id` (`GET
/platform-admin/subscriptions/:id`) en vez de buscarla dentro de una lista
paginada.
