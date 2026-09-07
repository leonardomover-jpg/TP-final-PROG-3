# 05 — Observaciones y Riesgos No Explícitos en el Pedido Original

El pedido original pide explícitamente: *"si durante el desarrollo detectás
una funcionalidad necesaria que no está contemplada en este documento,
señalala antes de implementarla, explicá por qué es necesaria y proponé
cómo integrarla sin romper la arquitectura existente."* Este documento
cumple ese pedido para lo detectado durante el análisis de la Etapa 1.
Ninguno de estos puntos se implementó todavía — quedan para discusión y
priorización en el roadmap.

## 1. Unicidad de email: decisión tomada y su porqué

**No estaba explícito** si el email de un usuario debe ser único en toda la
plataforma o por negocio. Se decidió: **único por tenant**
(`@@unique([tenantId, email])`), no global.

- **Por qué:** dos negocios completamente distintos y sin relación entre sí
  podrían coincidir en que un empleado usa el mismo email personal en
  ambos (ej. alguien que trabaja medio día en una barbería y medio día en
  otra, como dueño de las dos cuentas separadas). Si el email fuera único
  global, el segundo negocio no podría dar de alta a esa persona.
- **Consecuencia:** una misma persona con cuentas en 2 negocios tiene 2
  registros de `User` completamente independientes (una password distinta
  posible en cada uno). No hay "identidad global" de usuario en v1.
- **Cómo se integra sin romper nada:** si en el futuro se pide una
  identidad unificada (SSO entre negocios del mismo dueño), se puede
  agregar una tabla `Identity` opcional que varios `User` referencien, sin
  tocar el modelo actual.

## 2. Límite de uso de plan como concepto propio (`PlanLimitsGuard`)

El pedido menciona límites (`maxUsers`, `maxProfessionals`, etc. — punto 9)
pero no menciona explícitamente **qué pasa cuando un negocio llega al
límite** ni quién lo hace cumplir.

- **Propuesta:** un `PlanLimitsService`/`PlanLimitsGuard` centralizado
  (mismo patrón que `FeatureFlagService`, doc `03`) que se evalúa en los
  endpoints de creación (`POST /users`, `POST /professionals`,
  `POST /branches`, `POST /clients`) y devuelve un error claro: *"Alcanzaste
  el límite de 5 profesionales de tu plan actual. Mejorá tu plan para
  agregar más."* Sin este servicio, el límite terminaría chequeado (o no)
  de forma inconsistente en cada controller.

## 3. Unicidad del slug del negocio y cambio de plan con datos por encima del nuevo límite

- **Riesgo no contemplado:** si un negocio en plan Premium tiene 20
  profesionales y el SUPER ADMIN le baja el plan (o el negocio hace
  downgrade) a un plan que permite solo 5, ¿qué pasa con los 15 de más?
- **Propuesta:** el downgrade no borra ni desactiva profesionales
  existentes automáticamente (evita pérdida de datos operativos en
  producción); en cambio, bloquea la creación de nuevos hasta volver a estar
  bajo el límite, y lo muestra como alerta en el dashboard. Se define en la
  etapa de Planes/Suscripciones cuando se implemente el flujo de cambio de
  plan.

## 4. Zona horaria y DST por tenant vs. por sucursal

El pedido fija Argentina como default, pero Argentina no usa horario de
verano actualmente — igual se modela `timezone` a nivel `Tenant` (no
hardcodeado como constante global) para no tener que migrar el esquema el
día que se soporte otro país (alineado con el punto 88, internacionalización
preparada).

## 5. Rol "profesional" vs. entidad "Professional": son cosas distintas

**Ambigüedad detectada:** el pedido usa "profesional" tanto para el *rol de
acceso al sistema* (punto 5: tipos de usuario) como para la *entidad de
negocio* que se agenda en turnos (punto 23: nombre, foto, especialidades,
comisión...). No todo `Professional` necesariamente tiene login propio (un
negocio chico puede cargar profesionales solo para agendarlos, sin darles
usuario y contraseña).

- **Propuesta:** `Professional` es una entidad de negocio independiente de
  `User`, con una FK opcional `userId` (nullable) cuando ese profesional sí
  tiene acceso al sistema. Esto evita forzar la creación de un usuario del
  sistema por cada profesional que se quiera simplemente agendar.

## 6. Tabla `TenantIntegration` para credenciales de servicios externos

El pedido pide conectar cuentas de Mercado Pago/WhatsApp/Meta por negocio
(punto 12, 15, 43-47) pero no especifica el modelo de datos. Se necesita una
tabla genérica (a diseñar en detalle en la etapa de integraciones):

```
TenantIntegration
 ├── tenantId → Tenant
 ├── provider        (mercado_pago | whatsapp | instagram | facebook)
 ├── status           (connected | disconnected | error)
 ├── credentialsRef    (referencia a un secreto cifrado, NUNCA el token en texto plano en esta tabla)
 └── connectedAt / updatedAt
```

Los tokens/credenciales reales se guardan cifrados (KMS o cifrado a nivel
de aplicación con clave en variable de entorno), nunca en texto plano en la
base — esto es más estricto que "usar variables de entorno" (punto 92)
porque acá el secreto es *por tenant*, no un secreto único de la plataforma.

## 7. Retención y borrado de datos (Argentina — Ley 25.326)

El punto 69 pide contemplar "la normativa aplicable en Argentina" para
privacidad, pero no baja a un mecanismo concreto.

- **Propuesta:** cuando un tenant se cancela definitivamente, sus datos
  personales (clientes, usuarios) se anonimizan después de un período de
  retención configurable (ej. 90 días, para permitir reactivación o disputa
  de facturación), en vez de borrarse inmediatamente o conservarse para
  siempre. Se define en detalle en la etapa de Privacidad/Backups.

## 8. Notificación de "casi alcanzo el límite del plan" antes de bloquear

No estaba pedido, pero es una mejora de UX/negocio de bajo costo: avisar al
75%/90% del límite de uso del plan (no solo bloquear al 100%), reutilizando
el mismo `PlanLimitsService` del punto 2. Se marca como *nice-to-have* para
la etapa de Notificaciones, no bloqueante.

## 9. Ambiente de pruebas de Mercado Pago / Meta separado por entorno, no por tenant

El pedido no lo menciona, pero es necesario para poder testear (punto 72-73)
sin afectar cobros reales: la configuración de credenciales sandbox/producción
de Mercado Pago y Meta se maneja por **entorno de despliegue** (dev/staging/
producción), no por tenant — un tenant no elige "modo test", el sistema lo
determina por dónde está corriendo.

## 10. Resumen de prioridad

Ninguno de estos puntos bloquea el inicio de la Etapa 2 (Auth + Usuarios +
RBAC + Multi-tenancy). Los puntos 1, 2 y 5 sí afectan directamente el
`schema.prisma` fundacional de esta etapa y ya están reflejados en el diseño
del doc `02`. Los puntos 3, 6, 7, 8 y 9 se resuelven en sus etapas
correspondientes del roadmap (doc `06`).
