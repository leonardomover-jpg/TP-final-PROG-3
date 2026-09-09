# 20 — WhatsApp (Meta Cloud API) (Etapa 16)

## 1. Qué problema resuelve

Que un negocio conecte SU PROPIA cuenta de WhatsApp Business (Meta Cloud
API) para avisar automáticamente a sus clientes cuando se confirma o
cancela un turno, mande un recordatorio a mano cuando lo necesite, y
reciba los mensajes entrantes de sus clientes en su centro de
notificaciones (Etapa 14) — sin depender de la cuenta de WhatsApp
personal de nadie del equipo.

## 2. Dependencias

Depende de: `TenantIntegration` (Etapa 15, mismo modelo genérico
extendido con campos propios de WhatsApp), `AppointmentsService` (Etapa
10, hooks en `confirm`/`cancel`), `NotificationsService` (Etapa 14, avisa
al staff de un mensaje entrante), `FeatureFlagsService` (Etapa 4, el flag
`whatsapp` ya estaba sembrado en el catálogo desde el arranque del
proyecto sin ningún endpoint que lo usara hasta esta etapa).

## 3. Modelo de datos

Reusa `TenantIntegration` (Etapa 15) con `provider: "whatsapp"` y los
campos que ya se agregaron pensando en esto:

```
phoneNumberId          — no es secreto (WhatsApp Business phone number id)
encryptedAccessToken    — token de acceso de la app de Meta
encryptedWebhookSecret  — App Secret de Meta (firma X-Hub-Signature-256)
encryptedVerifyToken    — token que el negocio elige para el handshake GET
```

Ningún modelo nuevo — no hay ledger de mensajes en esta etapa (ver
sección 6).

## 4. Cifrado de credenciales (igual que Mercado Pago, Etapa 15)

Mismo `src/common/crypto/tenant-secret-cipher.ts` (AES-256-GCM,
`TENANT_SECRETS_ENCRYPTION_KEY`) — nunca texto plano en la base, nunca
devuelto en una respuesta HTTP (`IntegrationsService` usa el mismo
`SAFE_SELECT` de la Etapa 15). El access token y el phoneNumberId se
validan contra la API real (`GET /{phoneNumberId}`) antes de guardarse —
mismo principio de "no asumir, verificar" ya aplicado con Mercado Pago.

## 5. `whatsapp-client.ts` (Meta Cloud API)

Mismo molde que `mercado-pago-client.ts` (Etapa 15): funciones puras
parametrizadas por credenciales, nunca leen variables de entorno.

- `sendTextMessage`: `POST /{phoneNumberId}/messages`, mensaje de texto
  libre.
- `validateCredentials`: `GET /{phoneNumberId}` para confirmar el token
  antes de guardarlo.
- `verifyHandshake`: compara el `hub.verify_token` que manda Meta contra
  el que el negocio eligió, en tiempo constante.
- `verifyWebhookSignature`: valida `X-Hub-Signature-256`
  (`sha256=<hex hmac-sha256 del BODY CRUDO>`) — a diferencia de la firma de
  Mercado Pago (que se calcula sobre un "manifest" armado con headers/
  query, nunca sobre el body), Meta firma los bytes exactos del JSON
  recibido. Eso obligó a habilitar `rawBody: true` en `NestFactory.create`
  (`main.ts` y `test/setup.ts`) — Nest expone `request.rawBody` (un
  `Buffer`) además del body ya parseado, sin cambiar nada para el resto de
  los endpoints de la app.

## 6. Envío automático: confirmaciones y cancelaciones (best-effort)

`WhatsAppService.notifyAppointmentConfirmed`/`notifyAppointmentCancelled`
se llaman desde `AppointmentsService.confirm`/`cancel` (Etapa 10) después
de que la transición de estado ya se guardó. **Nunca** rompen el flujo
principal: si el negocio no tiene WhatsApp conectado, no tiene el flag
`whatsapp` habilitado, el cliente no tiene teléfono cargado, o el envío
falla por cualquier motivo, el turno se confirma/cancela igual — el error
queda solo en el log (`WhatsAppService.trySend`). Mismo criterio de
"secundario nunca bloquea lo principal" ya aplicado con los triggers de
Notificaciones en la Etapa 14.

El recordatorio manual (`POST /appointments/:id/send-reminder`) es la
EXCEPCIÓN a propósito: ahí el envío ES el pedido completo, así que sí
responde con error claro (400) si no se puede mandar — no tendría sentido
un "recordatorio" que silenciosamente no manda nada.

## 5.1. Endpoints

```
POST   /integrations/whatsapp/connect       integraciones.gestionar + flag whatsapp
DELETE /integrations/whatsapp                integraciones.gestionar + flag whatsapp
POST   /appointments/:id/send-reminder       turnos.editar

GET    /webhooks/whatsapp/tenant/:tenantId   (público, handshake de Meta)
POST   /webhooks/whatsapp/tenant/:tenantId   (público, mensajes entrantes)
```

`GET /integrations` (Etapa 15) ya lista cualquier integración conectada,
WhatsApp incluido — sin endpoint nuevo para eso.

## 7. Webhook por tenant y mensajes entrantes

Mismo patrón que el webhook de Mercado Pago por tenant (Etapa 15):
`PrismaService` crudo, el `tenantId` se resuelve de la URL (la misma que
se configura en el dashboard de Meta), nunca de un JWT. Un mensaje
entrante válido (firma verificada) se traduce en una `Notification`
(Etapa 14) para los usuarios con `turnos.ver` — el negocio lo ve en su
centro de notificaciones, no hay bandeja de WhatsApp separada.

## 8. Qué NO se hizo en esta etapa (a propósito)

- **Flujo de reserva por chat** (que un cliente reserve un turno
  charlando por WhatsApp, punto explícito del roadmap): necesitaría un
  motor conversacional con estado por conversación (saludo → elegir
  servicio → elegir profesional → elegir horario → confirmar, cruzando
  contra el motor de disponibilidad real de la Etapa 10) — un diseño que
  el pedido no especifica en el detalle necesario para construirlo sin
  inventar la experiencia completa (punto 94/95 del pedido: no inventar
  sin verificar la necesidad concreta). Esta etapa deja la infraestructura
  lista (recepción de mensajes, verificación de firma, envío) para que ese
  motor se construya como una extensión concreta cuando el pedido lo
  precise con más detalle.
- **Recordatorios automáticos programados** (ej. "recordale al cliente 24hs
  antes"): la Capa Transversal "Jobs en background" (doc 01) todavía no
  existe — sin un scheduler no hay forma real de disparar esto en el
  momento justo. El recordatorio manual (`POST
  /appointments/:id/send-reminder`) es el sustituto disponible hoy.
  automatizarlo es la extensión natural una vez que exista esa Capa
  Transversal, no antes.
- **Mensajes con "template" pre-aprobado** (obligatorios fuera de la
  ventana de 24hs desde el último mensaje del cliente, según las reglas
  de Meta): solo texto libre en esta etapa — usar templates requiere
  registrarlos y aprobarlos en el Business Manager de cada negocio, un
  paso manual fuera del alcance del backend.
- **Ledger de mensajes enviados/recibidos**: los mensajes entrantes se
  traducen en `Notification` (sin guardar el mensaje original aparte); los
  salientes no dejan ningún registro persistido más allá del log. Un
  historial de conversación completo es una extensión futura si se pide.
- **Multimedia** (imágenes, audio, ubicación): solo texto en esta etapa.

## 9. Tests

`test/whatsapp.spec.ts` (12 tests): sin el flag `whatsapp` habilitado,
conectar la cuenta responde 403; confirmar/cancelar un turno funciona
igual aunque WhatsApp no esté conectado (best-effort real, no solo en la
documentación); el recordatorio manual rechaza con 400 si no hay
WhatsApp conectado; rechaza conectar con credenciales inválidas sin
guardar nada; conecta con credenciales válidas sin exponer los secretos
en ninguna respuesta; confirmar un turno dispara el envío real (mockeado)
del mensaje; el recordatorio manual envía el mensaje y responde
`sent:true`; rechaza el recordatorio si el cliente no tiene teléfono
cargado; el handshake GET del webhook responde el `hub.challenge` con el
verify token correcto y rechaza uno incorrecto (403); un mensaje entrante
con firma válida genera una notificación para el staff, una firma
inválida se rechaza (401); aplicación real de
`integraciones.gestionar`/`turnos.editar`; aislamiento multi-tenant (un
webhook dirigido al tenant equivocado se ignora, nunca usa credenciales
de otro negocio). 147 tests en la suite completa (12 nuevos).
