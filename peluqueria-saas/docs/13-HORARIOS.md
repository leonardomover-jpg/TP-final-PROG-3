# 13 — Horarios (Etapa 9)

## 1. Qué problema resuelve

Responder "¿este negocio (o este profesional) está trabajando tal día, y
en qué horario?", combinando tres fuentes: el horario semanal recurrente
(ya modelado desde la Etapa 7 para profesionales, extendido acá a
sucursales), excepciones puntuales (vacaciones, refacciones, horario
reducido un día concreto) y feriados nacionales (con la posibilidad de que
el negocio decida igual abrir). Agenda/Turnos (Etapa 10) va a apoyarse en
este cálculo como su primera pregunta antes de ofrecer un turno — pero
generar slots reservables y validar superposición con turnos ya tomados es
explícitamente de esa etapa, no de esta (ver sección 7).

## 2. Dependencias

Depende de: `Branch` (Etapa 2), `Professional`/`ProfessionalSchedule`
(Etapa 7). Es requisito de: Agenda y Turnos (Etapa 10, el motor de
disponibilidad real).

## 3. Modelo de datos

```
BranchSchedule            (horario semanal recurrente de una sucursal)
  id, branchId, dayOfWeek (0-6), startTime ("HH:mm"), endTime ("HH:mm")

ScheduleException         (excepción puntual, sucursal O profesional)
  id, tenantId, branchId?, professionalId?, date, isClosed, startTime?,
  endTime?, reason?

Holiday                   (catálogo GLOBAL de feriados argentinos)
  id, date (único), name, year

TenantHolidayOverride     (por negocio: "igual abro este feriado")
  tenantId, holidayId, isOpen
```

Decisiones de diseño:

- **`BranchSchedule` es el mismo shape que `ProfessionalSchedule`** (Etapa
  7) — de hecho comparten el mismo DTO de validación
  (`src/common/dto/set-schedule.dto.ts`, extraído en esta etapa para no
  duplicar la lógica). `PUT /branches/:id/schedule` reemplaza el horario
  completo, mismo criterio que el de profesionales.
- **`ScheduleException` es de la sucursal O de un profesional, nunca
  ambos ni ninguno** — es una regla cruzada entre dos campos opcionales
  que Prisma/`class-validator` no expresan bien de forma declarativa, así
  que se valida explícitamente en `ScheduleService.createException`
  (`BadRequestException` si no se cumple el XOR). Con `isClosed: false`
  (horario distinto al habitual, no un cierre), `startTime`/`endTime` son
  obligatorios — misma razón, mismo lugar de validación.
- **`Holiday` es un catálogo GLOBAL gestionado por SUPER ADMIN**
  (`platform-admin/holidays`), no algo que cada negocio carga por su
  cuenta — mismo criterio que `FeatureFlag`: un feriado nacional es el
  mismo para todos los negocios del país, tiene sentido cargarlo una sola
  vez. `Holiday.date` es `@unique`: no puede haber dos feriados cargados
  para el mismo día.
- **`TenantHolidayOverride`, default CERRADO sin fila**: si un negocio no
  tiene una fila de override para un feriado, se considera cerrado ese
  día — es la postura conservadora (un feriado nacional es no laborable
  por default; el negocio decide explícitamente si igual atiende, no al
  revés). Mismo criterio que `TenantFeatureFlag` en su intercepción de la
  extensión de Prisma (clave compuesta, solo `findMany`/`upsert`
  interceptados).

## 4. Honestidad sobre el catálogo de feriados sembrado (punto 94 del pedido)

El seed carga los feriados **inamovibles** (fecha fija todos los años) de
2026 más el Viernes Santo (calculado para el calendario litúrgico de
2026): Año Nuevo, 24 de marzo, 2 de abril, Viernes Santo, 1° de mayo, 25 de
mayo, 20 de junio, 9 de julio, 8 de diciembre y Navidad — 10 feriados.

**Deliberadamente NO se sembraron** los feriados **trasladables** (Paso a
la Inmortalidad del Gral. San Martín, Día del Respeto a la Diversidad
Cultural, Día de la Soberanía Nacional): su fecha exacta la fija un
decreto del Poder Ejecutivo cada año (históricamente se mueven al lunes
más cercano por motivos turísticos) y no hay forma de confirmar la fecha
2026 exacta sin consultar el decreto vigente en el momento — mismo
principio ya aplicado en la Etapa 5 para Mercado Pago: no inventar un dato
verificable sin verificarlo. SUPER ADMIN los carga desde
`platform-admin/holidays` una vez confirmado el decreto del año.
**Antes de ir a producción**, hay que re-sembrar/actualizar el catálogo
completo cada año calendario — no es un cálculo automático.

## 5. Endpoints

```
PUT    /branches/:id/schedule                sucursales.editar (horario semanal de la sucursal)

POST   /schedule/exceptions                  horarios.gestionar
GET    /schedule/exceptions?branchId=|professionalId=  horarios.ver
DELETE /schedule/exceptions/:id              horarios.gestionar

GET    /schedule/holidays                    horarios.ver (catálogo + override de este negocio)
PATCH  /schedule/holidays/:holidayId/override horarios.gestionar

GET    /schedule/availability?date=&branchId=|professionalId= horarios.ver

platform-admin/holidays  (CRUD del catálogo global, SUPER ADMIN)
```

## 6. Cómo se calcula `GET /schedule/availability`

En orden, la primera fuente que aplica gana:

1. **`ScheduleException`** para esa sucursal/profesional y esa fecha
   exacta — si existe, define todo (cerrado, o el horario excepcional).
2. **`Holiday`** para esa fecha — si existe y el negocio NO tiene un
   `TenantHolidayOverride` con `isOpen: true`, cerrado con el motivo
   `"Feriado: {nombre}"`. Si el override existe con `isOpen: true`, sigue
   al paso 3 (el negocio decidió abrir igual, con su horario normal).
3. **`BranchSchedule`/`ProfessionalSchedule`** para ese día de la semana
   — si hay entradas, abierto con esos horarios; si no hay ninguna,
   cerrado ("Sin horario cargado para este día").

`branchId`/`professionalId` se validan contra el tenant actual ANTES de
consultar `BranchSchedule`/`ProfessionalSchedule` (que no tienen
`tenantId` propio y no los filtra `tenant-scope.extension.ts`) — sin esa
validación, pasar el id de una sucursal/profesional de otro tenant
filtraría su horario semanal. Se testea explícitamente (sección 8).

## 7. Qué NO se hizo en esta etapa (a propósito)

- **Generación de slots reservables / motor de turnos real**: `GET
  /schedule/availability` responde "abierto/cerrado y en qué horario para
  UN día", no "qué horas concretas quedan libres considerando la duración
  del servicio y los turnos ya tomados" — eso es la Etapa 10, que
  consume este endpoint como insumo.
- **Validación de superposición entre rangos** de un mismo horario
  semanal o entre una excepción y el horario normal: se deja para cuando
  exista el motor de disponibilidad real (Etapa 10), mismo criterio ya
  documentado para `ProfessionalSchedule` en la Etapa 7.
- **Feriados trasladables 2026**: ver sección 4.
- **Zona horaria por sucursal**: `Tenant.timezone` existe desde la Etapa 1
  pero esta etapa no lo usa todavía (las fechas se tratan como
  fecha-sin-hora en UTC) — se incorpora si aparece un caso concreto de
  negocio con sucursales en más de una zona horaria.

## 8. Tests

`test/schedule.spec.ts`: horario semanal de sucursal (`PUT` reemplaza
completo, aparece en la ficha); disponibilidad sin excepción ni feriado
(usa el horario semanal, o "sin horario" si ese día no tiene ninguno);
excepciones (cierran un día puntual, lo abren con horario distinto,
validación XOR sucursal/profesional, validación de horario obligatorio si
`isClosed: false`, se pueden borrar); feriados (catálogo con
`isOpenForTenant` mergeado, default cerrado, override abre y cae al
horario semanal); aplicación real de `horarios.gestionar`/`horarios.ver`;
aislamiento multi-tenant (una sucursal ajena no es alcanzable ni para
consultar disponibilidad ni para cargar una excepción, y el override de
feriado de un negocio no afecta a otro aunque sea el mismo `Holiday`). 76
tests en la suite completa (7 nuevos de esta etapa).
