# 04 — Seguridad Baseline (aplica a todos los módulos futuros)

Este documento fija los principios de seguridad que **todo módulo
implementado en etapas siguientes debe cumplir por defecto**, para no tener
que redescubrirlos módulo por módulo. Es un checklist de referencia para el
"Paso 7 — Seguridad" de la metodología por etapas del cliente.

## 1. Autenticación y sesiones

- Contraseñas con **Argon2id** (no bcrypt puro, no MD5/SHA).
- JWT de acceso de vida corta (15 min) + refresh token de vida larga
  (7-30 días), refresh token guardado como cookie `HttpOnly`, `Secure`,
  `SameSite=Strict`.
- Refresh tokens con posibilidad de revocación (tabla de sesiones activas),
  para poder "cerrar sesiones" (punto 8 del pedido).
- MFA (TOTP) **obligatorio** para `PlatformAdmin` (SUPER ADMIN), opcional
  para admins de negocio.
- Rate limiting en `/auth/login` y `/auth/refresh` (por IP y por
  email/cuenta) para mitigar fuerza bruta.
- Bloqueo temporal de cuenta tras N intentos fallidos consecutivos.

## 2. Autorización

- Todo endpoint de negocio pasa por, en este orden: `AuthGuard` (JWT válido)
  → `TenantGuard` (resuelve tenant desde el token, nunca desde un parámetro
  de la request) → `PermissionsGuard` (RBAC) → `FeatureFlagGuard` (si aplica)
  → `PlanLimitsGuard` (si aplica, ej. al crear el usuario N+1 sobre el
  límite del plan).
- Nunca confiar en que el frontend oculte un botón: cada acción sensible
  tiene su propio permiso verificado en backend (punto 6 del pedido).
- IDOR: todo lookup por ID (`GET /clients/:id`, `PATCH /appointments/:id`,
  etc.) valida que la entidad pertenezca al tenant resuelto por sesión antes
  de devolver/modificar cualquier dato — no alcanza con que el ID exista.

## 3. Validación de entrada

- DTOs con `class-validator`/`zod` en cada endpoint; rechazo explícito de
  campos no declarados (whitelist), para prevenir mass assignment
  (`tenantId`, `role`, `status` nunca se aceptan desde el cliente en
  endpoints donde el usuario no debería poder setearlos).
- Sanitización de HTML en cualquier campo de texto libre que se vaya a
  renderizar (notas de cliente, descripciones) para prevenir XSS
  almacenado.
- Validación de tipo/tamaño/extensión real (no solo por nombre de archivo)
  en toda subida de archivos (fotos de perfil, logos, adjuntos de soporte),
  con nombres de archivo generados server-side para prevenir path
  traversal y ejecución de archivos maliciosos.

## 4. Transporte y cabeceras

- HTTPS obligatorio (HSTS).
- CSP restrictiva por defecto.
- CSRF: no aplica de la misma forma a una API pura con Bearer token, pero
  si se usa cookie para el refresh token, se agrega token CSRF de doble
  envío en las rutas que dependen de esa cookie.
- CORS con whitelist explícita de orígenes (dominio del panel, dominios de
  páginas públicas por tenant), nunca `*` en endpoints autenticados.

## 5. Base de datos

- Ver doc `02`: `tenant_id` obligatorio + filtro automático + RLS como
  defensa adicional.
- Queries parametrizadas exclusivamente (el ORM ya lo garantiza; prohibido
  interpolar strings en SQL crudo si alguna vez se necesita un `$queryRaw`).
- Soft delete en entidades con valor histórico/legal (usuarios, clientes,
  ventas — nunca un DELETE físico de una venta o un pago).

## 6. Secretos y configuración

- Todo secreto (`JWT_SECRET`, `MERCADO_PAGO_ACCESS_TOKEN`, `META_TOKEN`,
  `WEBHOOK_SECRET`, credenciales de base/Redis/almacenamiento) vive en
  variables de entorno, nunca en el código ni en el repositorio.
- `.env` está en `.gitignore` desde el primer commit del proyecto backend
  (se valida antes del primer push de código de la etapa 2).

## 7. Webhooks (Mercado Pago, Meta)

- Verificación de firma/secret del proveedor antes de procesar cualquier
  payload.
- Idempotencia por `(provider, providerEventId)` con constraint único (ver
  `SubscriptionPayment` en doc `03` como ejemplo del patrón).
- Un webhook nunca dispara lógica de negocio síncronamente en el handler:
  valida y encola un job; el procesamiento real ocurre en el worker, con
  reintentos.

## 8. Auditoría

- Toda acción administrativa crítica (cambios de precio, de permisos, de
  stock, apertura/cierre de caja, acciones de SUPER ADMIN sobre un tenant)
  se escribe en `AuditLog` (doc `02`) de forma síncrona con la operación
  (misma transacción o inmediatamente después, nunca "mejor esfuerzo" vía
  job que puede perderse silenciosamente para este tipo de evento).

## 9. Errores

- Nunca se devuelve un stack trace ni un mensaje de error de base de datos
  al cliente. Se devuelve un mensaje genérico ("No pudimos procesar la
  operación. Intentá nuevamente.") y se registra el detalle técnico en
  logs del lado del servidor con un `errorId` correlacionable (punto 87).

## 10. Tests de seguridad obligatorios desde la etapa 2 (auth + tenancy)

- Tenant A no puede leer/escribir datos de Tenant B (por ID directo y por
  enumeración).
- Un usuario sin el permiso `X` recibe 403 al intentar la acción que
  requiere `X`, aunque conozca la URL exacta.
- Un JWT expirado o manipulado (firma inválida) es rechazado.
- Un webhook con firma inválida es rechazado y no se procesa.
- Un webhook duplicado (mismo `providerEventId`) no duplica el efecto
  (ej. no acredita el pago dos veces).
