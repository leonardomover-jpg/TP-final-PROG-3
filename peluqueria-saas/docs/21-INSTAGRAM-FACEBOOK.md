# 21 — Instagram / Facebook (Meta) (Etapa 17)

## 1. Qué problema resuelve

Que un negocio conecte su Página de Facebook y su cuenta de Instagram
Business para recibir en su centro de notificaciones (Etapa 14) los
mensajes que le mandan sus clientes por Messenger o Instagram Direct, y
pueda responderlos desde el backend — mismo espíritu que WhatsApp (Etapa
16), con la cuenta de CADA negocio, no la de la plataforma.

## 2. Dependencias

Depende de: `TenantIntegration` (Etapa 15, extendido una vez más),
`src/common/crypto/meta-webhook-signature.ts` (extraído en esta etapa de
`whatsapp-client.ts` — Facebook, Instagram y WhatsApp comparten
exactamente el mismo mecanismo de verificación de Meta),
`NotificationsService` (Etapa 14). Los flags `facebook`/`instagram` ya
estaban sembrados en el catálogo desde el arranque del proyecto sin
ningún endpoint que los usara hasta esta etapa.

## 3. Modelo de datos

Reusa `TenantIntegration` (Etapa 15) con `provider: "facebook"` o
`"instagram"` y un campo nuevo:

```
externalAccountId — no es secreto (Page ID de Facebook / IG Business
                     Account ID de Instagram)
```

`encryptedAccessToken`/`encryptedWebhookSecret`/`encryptedVerifyToken` se
reusan tal cual (mismo significado que en WhatsApp: token de acceso, App
Secret para la firma, verify token propio para el handshake).

## 4. `meta-client.ts` — un solo módulo para los dos providers

Facebook Messenger e Instagram Messaging (vía Facebook Login for
Business) comparten la MISMA forma de request/response de la Messenger
Platform — así que `meta-client.ts` tiene una sola implementación interna
(`sendGraphMessage`) detrás de dos nombres (`sendFacebookMessage`/
`sendInstagramMessage`), y `IntegrationsService` tiene un único par de
helpers privados (`connectMetaMessaging`/`disconnectMetaMessaging`)
detrás de los cuatro métodos públicos (`connectFacebook`/
`disconnectFacebook`/`connectInstagram`/`disconnectInstagram`) — en vez
de repetir cuatro veces casi el mismo código. Fuente de la forma exacta
del payload (`entry[].messaging[]`, con `sender.id`/`message.text`):
documentación oficial de Meta for Developers, Messenger Platform
webhooks (punto 94 del pedido: nunca se inventó un formato).

## 5. Endpoints

```
POST   /integrations/facebook/connect        integraciones.gestionar + flag facebook
DELETE /integrations/facebook                 integraciones.gestionar + flag facebook
POST   /integrations/instagram/connect        integraciones.gestionar + flag instagram
DELETE /integrations/instagram                 integraciones.gestionar + flag instagram

POST   /meta-messaging/reply { provider, recipientId, message }   mensajes.gestionar

GET    /webhooks/facebook/tenant/:tenantId    (público, handshake de Meta)
POST   /webhooks/facebook/tenant/:tenantId     (público, mensajes entrantes)
GET    /webhooks/instagram/tenant/:tenantId   (público, handshake de Meta)
POST   /webhooks/instagram/tenant/:tenantId    (público, mensajes entrantes)
```

Nuevo permiso `mensajes.gestionar` (responder por cualquiera de los dos
canales) — `integraciones.gestionar` sigue cubriendo conectar/desconectar
cualquier integración externa, mismo criterio ya anticipado en la
descripción de ese permiso desde la Etapa 15.

## 6. Webhook por tenant: un solo service, dos rutas

`MetaTenantWebhookService` está parametrizado por `provider` (igual
razón que `meta-client.ts`) — un mensaje entrante válido se traduce en
una `Notification` (Etapa 14) para los usuarios con `turnos.ver`, tipo
`facebook_message` o `instagram_message`. Sin motor conversacional, mismo
criterio de restricción que WhatsApp (doc `20-WHATSAPP.md` §8): responder
es manual, vía `POST /meta-messaging/reply`.

## 7. Qué NO se hizo en esta etapa (a propósito)

- **Publicar contenido** (posts, stories) o mostrar el feed de Instagram
  en algún lado: sin Página pública (Etapa 18) no hay dónde mostrarlo
  todavía, y "conexión de cuenta" (el único detalle concreto que da el
  roadmap para esta etapa) apunta a mensajería, no a publicación —
  inventar ese alcance sin que el pedido lo pida en detalle sería el mismo
  error que ya se evitó en Mercado Pago/WhatsApp (no anticipar UI/flujos
  no pedidos).
- **Comentarios de posts/stories**: solo mensajes directos (Messenger/
  Instagram Direct) en esta etapa, no comentarios públicos.
- **Un solo App de Meta compartido entre Facebook e Instagram**: en la
  práctica, una app de Meta puede tener ambos productos suscritos al
  mismo webhook. Acá se modelan como dos integraciones completamente
  independientes (dos conexiones, dos webhooks, credenciales propias cada
  una) — más simple de razonar y coherente con el resto del sistema
  (Mercado Pago/WhatsApp también son integraciones independientes entre
  sí), aunque no refleje 100% cómo un negocio podría configurarlo del
  lado de Meta.
- **Envío de multimedia**: solo texto, mismo criterio que WhatsApp.
- **Ledger de mensajes**: igual que WhatsApp, los mensajes entrantes se
  traducen en `Notification` sin guardar el original aparte.

## 8. Tests

`test/meta-messaging.spec.ts` (14 tests, `describe.each` sobre
`['facebook', 'instagram']` para la mitad de ellos): sin los flags
habilitados, conectar cualquiera de los dos responde 403; responder un
mensaje rechaza si el provider no está conectado; por cada provider —
rechaza conectar con credenciales inválidas sin guardar nada, conecta con
credenciales válidas sin exponer los secretos, responder un mensaje envía
el mensaje real (mockeado), el handshake GET del webhook responde el
challenge con el verify token correcto y rechaza uno incorrecto (403), un
mensaje entrante con firma válida genera una notificación para el staff y
una firma inválida se rechaza (401); aplicación real de
`integraciones.gestionar`/`mensajes.gestionar`; aislamiento multi-tenant
(un webhook a un tenant sin la integración conectada se ignora, nunca usa
credenciales de otro negocio). 161 tests en la suite completa (14
nuevos).
