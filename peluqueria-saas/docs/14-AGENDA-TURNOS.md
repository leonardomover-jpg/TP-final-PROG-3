# 14 — Agenda y Turnos (Etapa 10)

## 1. Qué problema resuelve

El motor de reservas real: un cliente pide un servicio con un profesional
en una fecha/hora, y el sistema tiene que decidir si eso es posible (el
profesional está disponible, habilitado para ese servicio, y no tiene otro
turno encimado) antes de guardarlo. Es la primera etapa que consume las
piezas construidas en las Etapas 6 a 9 (Clientes, Profesionales, Servicios,
Horarios) todas juntas.

## 2. Dependencias

Depende de: `Client` (Etapa 6), `Professional`/`ProfessionalSchedule`
(Etapa 7), `Service`/`ServiceProfessional` (Etapa 8),
`ScheduleService.getAvailability` (Etapa 9). Es requisito de: Ventas
(Etapa 12, un turno completado puede originar una venta), Notificaciones
(Etapa 14, confirmaciones/recordatorios), Mercado Pago para clientes
(Etapa 15, señas).

## 3. Modelo de datos

```
Appointment
  id, tenantId, branchId, professionalId, clientId, serviceId,
  startAt, endAt, status (pending|confirmed|completed|cancelled|no_show),
  notes?, cancelReason?, createdAt, updatedAt

WaitlistEntry
  id, tenantId, branchId?, professionalId?, clientId, serviceId,
  preferredDate?, notes?, status (waiting|booked|cancelled), createdAt
```

Decisiones de diseño:

- **`endAt` se guarda calculado en el momento de la reserva**
  (`startAt + Service.durationMinutes`), no se deriva en cada lectura. Si
  el precio o la duración del servicio cambian después, los turnos ya
  tomados no se recalculan solos — es la foto del momento de la reserva,
  igual que un ítem de una futura venta no cambia de precio si el
  catálogo se actualiza después.
- **Un turno = un servicio** (no una lista de servicios por turno). Un
  cliente que quiere corte + color reserva dos turnos consecutivos; el
  motor de disponibilidad ya evita que se superpongan entre sí para el
  mismo profesional. Modelar "un turno con N servicios" es una extensión
  natural si aparece el caso concreto, pero agregar esa complejidad ahora
  sin que el pedido la pida explícitamente sería inventar estructura
  (punto 95).
- **Estados**: `pending` (recién reservado) → `confirmed` (el negocio lo
  confirmó) → `completed` (se prestó el servicio) — o `cancelled` desde
  `pending`/`confirmed`, o `no_show` desde `confirmed`. Las transiciones
  inválidas (ej. completar un turno todavía `pending`, cancelar uno ya
  `completed`) se rechazan explícitamente
  (`AppointmentsService.assertTransition`), no silenciosamente.

## 4. El motor de disponibilidad (`AppointmentsService.create`)

En orden, todo tiene que pasar para que un turno se cree:

1. **Pertenencia al tenant**: `branchId`, `professionalId`, `clientId`,
   `serviceId` tienen que existir y no estar borrados en el negocio
   actual (`BadRequestException` si no).
2. **Profesional habilitado para el servicio**: existe una fila
   `ServiceProfessional` para ese par (Etapa 8) — si no, no se puede
   reservar aunque el profesional exista y esté activo.
3. **Dentro de la disponibilidad real**: se calcula `endAt` y se llama a
   `ScheduleService.getAvailability({ date, professionalId })` (Etapa 9,
   que ya resuelve excepción → feriado → horario semanal) — el rango
   `[startAt, endAt)` tiene que caer completo dentro de alguna de las
   franjas horarias devueltas.
4. **Sin superposición con otro turno activo** (`pending`/`confirmed`) del
   MISMO profesional: `existente.startAt < nuevoEndAt AND
   existente.endAt > nuevoStartAt` — la condición clásica de solapamiento
   de intervalos. Un turno `cancelled` o `no_show` no cuenta: no bloquea
   el horario para uno nuevo (testeado explícitamente).

## 5. Endpoints

```
GET    /appointments?from=&to=&branchId=&professionalId=&clientId=&status=  turnos.ver
GET    /appointments/:id                                                    turnos.ver
POST   /appointments                                                        turnos.crear
POST   /appointments/:id/confirm                                            turnos.editar
POST   /appointments/:id/cancel                                             turnos.cancelar
POST   /appointments/:id/complete                                           turnos.editar
POST   /appointments/:id/no-show                                            turnos.editar

GET    /waitlist?status=&clientId=   turnos.ver
POST   /waitlist                     turnos.crear
DELETE /waitlist/:id                 turnos.cancelar
```

**Sin endpoints separados por vista (día/semana/mes/lista)**: es el mismo
`GET /appointments` con distinto `from`/`to` — el pedido original lista
esas vistas como una necesidad de UI (qué pinta el calendario), no como
cuatro fuentes de datos distintas. El frontend arma la grilla con el rango
que corresponda a cada vista.

**Lista de espera reusa los permisos `turnos.*`** (ya seedeados desde la
Etapa 2): es parte del mismo módulo "Agenda y Turnos" del roadmap, no se
introduce un permiso nuevo sin un caso concreto que lo justifique.

## 6. Multi-tenancy

`Appointment`/`WaitlistEntry` se agregaron a `tenant-scope.extension.ts`
con el mismo patrón que `User`/`Branch`/`Service` (igualdad estricta de
`tenantId`). Antes de crear un turno, las 4 referencias
(`branch`/`professional`/`client`/`service`) se leen con el cliente
tenant-scoped — un id de otro tenant simplemente no aparece, así que
`AppointmentsService.create` lo trata como "no existe" (400), nunca
filtra datos ajenos (testeado explícitamente).

Un detalle de scoping de NestJS (mismo patrón ya documentado en la Etapa
5, doc `09` §8): `AppointmentsService` combina `TenantPrismaService`
(request-scoped) con `ScheduleService` (de otro módulo) en el
constructor — se fuerza `@Injectable({ scope: Scope.REQUEST })`
explícitamente en vez de confiar en la propagación automática de scope,
para no tener que re-diagnosticar el mismo bug si vuelve a aparecer con
esa combinación.

## 7. Qué NO se hizo en esta etapa (a propósito)

- **Señas** (seña/adelanto para confirmar un turno): depende de Mercado
  Pago para clientes, que es la Etapa 15 — el roadmap ya lo marca así
  desde la Etapa 1.
- **Auto-oferta de lista de espera** cuando se cancela un turno y se
  libera un lugar: `WaitlistEntry` es hoy una cola visible que el negocio
  gestiona a mano; automatizar el aviso es Notificaciones (Etapa 14).
- **Turno con varios servicios en una sola reserva**: ver sección 3.
- **Zona horaria por sucursal**: misma simplificación ya documentada en
  Horarios (doc `13` §7) — las fechas/horas se tratan en UTC.
- **Reglas de cancelación con penalización / ventana mínima**: el pedido
  no las especifica; `cancel` acepta cualquier turno activo en cualquier
  momento, con un motivo opcional. Si aparece el requisito, se agrega ahí.

## 8. Tests

`test/appointments.spec.ts`: reserva exitosa con `endAt` calculado
correctamente; rechazo por superposición con otro turno activo del mismo
profesional (y que un turno justo a continuación, sin superposición, sí
se puede); rechazo por horario fuera de la disponibilidad real; rechazo
por profesional no habilitado para el servicio; transiciones de estado
completas (incluidas las inválidas, y que un turno cancelado no bloquea
el horario para uno nuevo); listado con filtro por rango de fechas y por
estado; lista de espera (alta/listado/baja); aplicación real del permiso
`turnos.crear`; aislamiento multi-tenant completo (lista, `GET` por id
directo, y que no se puede reservar usando referencias de otro tenant
aunque se adivinen sus ids). 85 tests en la suite completa (9 nuevos de
esta etapa).
