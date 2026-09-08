# 12 — Servicios (Etapa 8)

## 1. Qué problema resuelve

Qué se le puede ofrecer al cliente: nombre, duración, precio, y quién
puede prestarlo. Agenda/Turnos (Etapa 10) necesita `Service.durationMinutes`
para calcular el fin de un turno y `ServiceProfessional` para no ofrecer un
turno con un profesional que no presta ese servicio — por eso Servicios
tenía que existir antes, con Profesionales ya resuelto (Etapa 7).

## 2. Dependencias

Depende de: multi-tenancy (Etapa 2), RBAC (permisos `servicios.*`, nuevos
en esta etapa), Profesionales (Etapa 7 — la relación "habilitados"). Es
requisito de: Agenda/Turnos (Etapa 10), Ventas (Etapa 12, ítems de una
venta pueden ser servicios).

## 3. Modelo de datos

```
Service
  id, tenantId, name, description?, category? (tag libre), durationMinutes,
  price, status (active|inactive), createdAt, updatedAt, deletedAt

ServiceProfessional (M:N)
  serviceId, professionalId
```

Decisiones de diseño:

- **`category` es un tag libre (`String?`), no un catálogo separado** —
  mismo criterio que `Professional.specialties` (doc `11` §3): no hay
  ningún caso de uso concreto todavía (gestionar/reordenar/traducir
  categorías) que justifique una tabla propia. Si aparece, se agrega ahí,
  no antes (punto 95 del pedido).
- **`ServiceProfessional` es la relación real** ("profesionales
  habilitados por servicio") que `Professional.specialties` explícitamente
  dejó pendiente para esta etapa (doc `11` §3) — a diferencia de
  `specialties`, que es solo metadata descriptiva, esta relación es la que
  Agenda/Turnos va a consultar para no ofrecer un turno imposible.
- **Sin `tenantId` propio en `ServiceProfessional`**: ambos extremos
  (`Service`, `Professional`) ya son tenant-scoped — `ServicesService`
  valida que el `Service` Y cada `Professional` de la lista pertenezcan al
  tenant actual (vía el cliente tenant-scoped, que ya filtra) antes de
  escribir el vínculo, así un id de otro tenant nunca llega a insertarse
  (test explícito de esto en la sección 8).
- **`PUT /services/:id/professionals` reemplaza la lista completa**, mismo
  criterio que `PUT /professionals/:id/schedule` de la Etapa 7: "quiénes
  atienden este servicio" se edita como un todo (`deleteMany` +
  `createMany` en una transacción), no de a un alta/baja incremental.

## 4. Permisos

Nuevos en esta etapa: `servicios.ver`, `servicios.crear`, `servicios.editar`
(incluye profesionales habilitados — `PUT .../professionals` exige este
mismo permiso, no uno separado, mismo criterio que el horario de
Profesionales), `servicios.eliminar`. Asignados a "Administrador del
negocio" (todos) y agregado `servicios.ver` a "Recepcionista" (necesita
verlos para agendar) y a "Profesional" (puede ver qué servicios presta) en
el seed.

## 5. Endpoints

```
GET    /services                  servicios.ver
GET    /services/:id              servicios.ver (ficha: datos + profesionales habilitados)
POST   /services                  servicios.crear
PATCH  /services/:id              servicios.editar
DELETE /services/:id              servicios.eliminar (soft delete)
PUT    /services/:id/professionals servicios.editar (reemplaza la lista completa)
```

## 6. Multi-tenancy y límites de plan

`Service` se agregó a `tenant-scope.extension.ts` con el mismo patrón que
`Professional`/`Client`/`User`/`Branch`. `ServiceProfessional` no tiene
`tenantId` propio y no se intercepta — ver sección 3.

**Sin `PlanLimitsGuard`, a propósito**: `Plan` no tiene un campo
`maxServices` — a diferencia de usuarios/sucursales/clientes/profesionales,
el pedido original no anticipó un límite por cantidad de servicios, y
agregar un campo al modelo de planes para un límite no pedido sería
inventar requisito (punto 95). Si en una etapa futura se pide, se agrega
`Plan.maxServices` y el `case` correspondiente en `PlanLimitsService` — el
mismo patrón ya seguido para `clients`/`professionals`.

## 7. Qué NO se hizo en esta etapa (a propósito)

- **Precio/duración variable por profesional**: en esta etapa el precio y
  la duración son del `Service`, iguales para cualquier profesional
  habilitado. Si el pedido necesita "este profesional cobra distinto por
  el mismo servicio", es una extensión de `ServiceProfessional` (agregar
  `priceOverride`/`durationOverride` nullable) — no se anticipa sin un
  caso concreto.
- **Categorías como catálogo gestionable**: ver sección 3.
- **Límite de plan por cantidad de servicios**: ver sección 6.

## 8. Tests

`test/services.spec.ts`: CRUD completo (crear/listar/ver ficha/editar/soft
delete); profesionales habilitados (`PUT` reemplaza completo, no acumula;
un `professionalId` inexistente se rechaza con 400 sin tirar un 500 de
constraint); aplicación real del permiso `servicios.crear`; aislamiento
multi-tenant completo (lista, `GET`/`PATCH`/`DELETE`/`PUT .../professionals`
por id directo, y específicamente que un servicio de un tenant no puede
habilitar un profesional de otro tenant aunque adivine su id). 69 tests en
la suite completa (4 nuevos de esta etapa).
