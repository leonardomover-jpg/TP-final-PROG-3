# 11 — Profesionales (Etapa 7)

## 1. Qué problema resuelve

Quién presta el servicio. Servicios (Etapa 8) va a definir "profesionales
habilitados por servicio", Horarios (Etapa 9) va a construir el motor de
disponibilidad real sobre el horario propio que se agrega acá, y Agenda/
Turnos (Etapa 10) necesita ambos para ofrecer horarios reales — por eso
Profesionales tenía que existir antes, en ese orden (doc `06`).

## 2. Dependencias

Depende de: multi-tenancy (Etapa 2), RBAC (permisos `profesionales.*`,
nuevos en esta etapa), Planes/límites (`PlanLimitsService`, Etapa 4 — el
`case 'professionals'` ya estaba anticipado usando `Plan.maxProfessionals`,
un campo que existe desde el schema fundacional de la Etapa 1 aunque nunca
se había usado). Es requisito de: Servicios, Horarios, Agenda/Turnos,
Ventas/Comisiones (todas referencian `Professional.id`).

## 3. Modelo de datos

```
Professional
  id, tenantId, userId? (único, vínculo opcional a User), firstName,
  lastName, phone?, email?, specialties (String[], tags libres),
  commissionPercentage? (Decimal 0-100), status (active|inactive),
  createdAt, updatedAt, deletedAt (soft delete)

ProfessionalSchedule
  id, professionalId, dayOfWeek (0=domingo…6=sábado), startTime ("HH:mm"),
  endTime ("HH:mm")
```

Decisiones de diseño:

- **Vínculo a `User` opcional y 1:1** (`userId` con `@unique`): un
  profesional puede trabajar en el negocio sin tener login propio (no
  todos los peluqueros necesitan acceso al sistema), y un `User` no
  necesariamente es profesional (el dueño puede solo administrar). Cuando
  sí se vincula, es uno a uno — `ProfessionalsService` valida antes de
  guardar que el `User` exista en el mismo tenant y no esté ya vinculado a
  otro profesional, para devolver un 400/409 claro en vez de que el
  `@unique` de la base tire un 500 sin contexto.
- **`specialties` como `String[]` (tags libres), no un catálogo**: la
  Etapa 8 (Servicios) va a introducir el modelo formal de "qué servicios
  puede prestar cada profesional" (relación real con `Service`), que es la
  pieza que realmente importa para el motor de turnos. `specialties` acá
  es solo metadata descriptiva para mostrar en la ficha/listado ("corte",
  "color", "barba") — construir un catálogo de especialidades separado
  antes de que exista Servicios sería resolver dos veces el mismo
  problema.
- **`ProfessionalSchedule` es SOLO el horario semanal recurrente propio**,
  sin excepciones ni feriados — eso es a propósito el límite de esta
  etapa. El "horario del negocio", las excepciones puntuales y los
  feriados argentinos (con override manual) son la Etapa 9, que combina su
  propio modelo con esta tabla para el motor de disponibilidad real de la
  Etapa 10. Separar así evita reconstruir `ProfessionalSchedule` cuando
  llegue la Etapa 9.
- **`PUT /professionals/:id/schedule` reemplaza el horario completo**, no
  agrega entradas una por una: editar "el horario de un profesional" es
  naturalmente una operación de reemplazo total (evita rangos superpuestos
  que quedan de una edición anterior sin borrar). Internamente es
  `deleteMany` + `createMany` en una transacción.
- **Sin validación de superposición de rangos en esta etapa**: sería
  necesaria para el motor de disponibilidad real (no ofrecer un turno
  imposible), pero acá `ProfessionalSchedule` es todavía solo el dato
  crudo de "en qué franjas trabaja" — esa validación se agrega en la
  Etapa 9/10 junto con el propio motor, no antes.

## 4. Permisos

Nuevos en esta etapa (no existían desde la Etapa 2, a diferencia de
`clientes.*`): `profesionales.ver`, `profesionales.crear`,
`profesionales.editar` (incluye el horario — `PUT .../schedule` exige este
mismo permiso, no uno separado, porque editar el horario es parte de
editar la ficha del profesional), `profesionales.eliminar`. Asignados a
"Administrador del negocio" (todos, como siempre) y agregado
`profesionales.ver` a "Recepcionista" (necesita ver la lista para agendar)
y a "Profesional" (puede ver la lista, ej. sus propios horarios) en el
seed de roles de sistema.

## 5. Endpoints

```
GET    /professionals              profesionales.ver
GET    /professionals/:id          profesionales.ver (ficha: datos + horario semanal)
POST   /professionals              profesionales.crear (+ PlanLimitsGuard, @LimitResource('professionals'))
PATCH  /professionals/:id          profesionales.editar
DELETE /professionals/:id          profesionales.eliminar (soft delete)
PUT    /professionals/:id/schedule profesionales.editar (reemplaza el horario semanal completo)
```

## 6. Multi-tenancy y límites de plan

`Professional` se agregó a `tenant-scope.extension.ts` con el mismo patrón
que `Client`/`User`/`Branch`. `ProfessionalSchedule` no tiene `tenantId`
propio (cuelga de `Professional.tenantId`) y no se intercepta — el service
valida que el `Professional` padre exista (ya filtrado por tenant) antes
de reemplazar su horario.

`PlanLimitsService.LimitableResource` pasó a incluir `'professionals'`,
usando `Plan.maxProfessionals` — un campo que ya estaba en el schema desde
la Etapa 1 (sembrado en los planes de ejemplo) pero sin ningún endpoint
que lo aplicara hasta ahora.

## 7. Qué NO se hizo en esta etapa (a propósito)

- **Catálogo formal de especialidades / servicios habilitados por
  profesional**: es la Etapa 8 (ver sección 3).
- **Horario del negocio, excepciones, feriados, motor de disponibilidad**:
  es la Etapa 9/10 (ver sección 3).
- **Comisiones calculadas / liquidaciones**: `commissionPercentage` es
  solo el dato de configuración (qué % le corresponde); el cálculo real
  sobre ventas es la Etapa 12 (Ventas + Caja + Gastos + Comisiones).

## 8. Tests

`test/professionals.spec.ts`: CRUD completo (crear/listar/ver ficha/
editar/soft delete, con verificación de que la fila sigue en la base
después del borrado); horario semanal (`PUT` reemplaza completo, no
acumula; formato de hora inválido rechazado); vínculo opcional a `User`
(vincular, rechazo de un segundo vínculo al mismo `User`, desvinculación
explícita con `userId: null`, rechazo de un `userId` inexistente sin
devolver 500); aplicación real del permiso `profesionales.crear`;
aislamiento multi-tenant completo (lista, `GET`/`PATCH`/`DELETE`/`PUT
.../schedule` por id directo); límite de plan (`maxProfessionals`)
bloqueando la creación de más profesionales que el plan permite. 65 tests
en la suite completa (6 nuevos de esta etapa).
