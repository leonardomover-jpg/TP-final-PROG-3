# 15 — Productos e Inventario (Etapa 11)

## 1. Qué problema resuelve

Qué productos vende el negocio además de servicios (shampoo, tinturas,
herramientas), cuánto stock queda, cuándo avisar que se está por acabar, y
cómo se repone comprándole a un proveedor. Es el primer módulo
**opcional** real: no todos los negocios venden productos, así que vive
detrás del feature flag `inventory` en vez de estar siempre disponible.

## 2. Dependencias

Depende de: multi-tenancy (Etapa 2), `FeatureFlagsService`/
`FeatureFlagGuard` (Etapa 4 — infraestructura construida pero sin ningún
consumidor real hasta esta etapa). Es requisito de: Ventas (Etapa 12, un
ítem de venta puede ser un producto que descuenta stock).

## 3. Modelo de datos

```
Product
  id, tenantId, name, sku? (único por tenant si se carga), description?,
  category? (tag), price, cost? (última compra recibida), unit,
  stock, minStock, status, createdAt, updatedAt, deletedAt

Supplier
  id, tenantId, name, contactName?, phone?, email?, notes?, status,
  createdAt, updatedAt, deletedAt

Purchase
  id, tenantId, supplierId, status (pending|received|cancelled), notes?,
  createdAt, updatedAt, receivedAt?

PurchaseItem
  id, purchaseId, productId, quantity, unitCost
```

Decisiones de diseño:

- **`category` es un tag libre**, mismo criterio que `Service.category`
  (doc `12` §3) — no un catálogo separado sin un caso de uso concreto que
  lo justifique.
- **`sku` opcional pero único por tenant cuando se carga**
  (`@@unique([tenantId, sku])`): Postgres no exige unicidad entre múltiples
  `NULL`, así que varios productos sin SKU conviven sin problema; el
  intento de crear un segundo producto con un SKU ya usado devuelve 409,
  no un 500 de constraint.
- **`Purchase` en `pending` no toca stock**. Solo `receive()` lo hace, en
  una transacción: por cada `PurchaseItem`, incrementa `Product.stock` y
  actualiza `Product.cost` al último `unitCost` recibido. Una compra
  `cancelled` nunca tocó nada — no hay que "revertir".
- **Sin edición de ítems de una compra ya creada**: el flujo es crear con
  los ítems finales → recibir o cancelar. Si hace falta corregir algo de
  una compra ya recibida, es un ajuste de stock manual
  (`POST /products/:id/stock-adjustment`), no reabrir la compra — evita el
  estado intermedio ambiguo de "una compra recibida con ítems editables".
- **Ajuste manual de stock sin ledger de movimientos**: el resultado queda
  en `Product.stock`, el motivo (`reason`) solo viaja en la respuesta del
  endpoint, no se persiste en una tabla de auditoría aparte. Un historial
  completo de movimientos de stock (kardex) es una extensión natural
  cuando exista el caso concreto (ej. un reporte de trazabilidad en la
  Etapa 20) — no se construye antes sin ese requisito (punto 95 del
  pedido).
- **Alertas de stock mínimo como filtro, no como endpoint aparte**:
  `GET /products?lowStock=true` filtra `stock <= minStock` en memoria (esa
  comparación entre dos columnas no se expresa como filtro de Prisma sin
  SQL crudo, y con el volumen esperado de productos de un negocio no
  justifica esa fricción).

## 4. Primer consumidor real de `FeatureFlagGuard`/`@RequiresFeature`

La Etapa 4 construyó esa infraestructura ("lista para que los módulos
opcionales de etapas siguientes se gateen sin repetir lógica") pero ningún
módulo la había usado todavía. `ProductsController`, `SuppliersController`
y `PurchasesController` llevan `@UseGuards(FeatureFlagGuard)` +
`@RequiresFeature('inventory')` a nivel de controller — sin ese flag
habilitado para el negocio, **todo** el módulo responde 403, sin importar
los permisos de rol que tenga el usuario (`inventory` ya estaba en el
catálogo de feature flags sembrado desde la Etapa 2, incluido en el plan
Premium de ejemplo pero no en el Básico).

## 5. Permisos

Se reutilizan los dos permisos ya sembrados desde la Etapa 2 (nunca
usados hasta ahora): `productos.gestionar` (catálogo de productos: CRUD
completo) e `inventario.gestionar` (ajuste de stock, proveedores,
compras). Es una sola acción por módulo, sin separar "ver" de "gestionar"
— así se sembraron originalmente, y separarlos ahora sin un caso concreto
que lo pida sería un permiso inventado.

## 6. Endpoints

```
GET    /products?lowStock=true       productos.gestionar
GET    /products/:id                 productos.gestionar
POST   /products                     productos.gestionar
PATCH  /products/:id                 productos.gestionar
DELETE /products/:id                 productos.gestionar (soft delete)
POST   /products/:id/stock-adjustment inventario.gestionar

GET    /suppliers                    inventario.gestionar
GET    /suppliers/:id                inventario.gestionar
POST   /suppliers                    inventario.gestionar
PATCH  /suppliers/:id                inventario.gestionar
DELETE /suppliers/:id                inventario.gestionar (soft delete)

GET    /purchases                    inventario.gestionar
GET    /purchases/:id                inventario.gestionar
POST   /purchases                    inventario.gestionar
POST   /purchases/:id/receive        inventario.gestionar
POST   /purchases/:id/cancel         inventario.gestionar
```

Los tres controllers llevan el `@RequiresFeature('inventory')` a nivel de
clase (sección 4) — se aplica a todas las rutas de arriba por igual.

## 7. Qué NO se hizo en esta etapa (a propósito)

- **Ledger de movimientos de stock (kardex)**: ver sección 3.
- **Ítems de compra editables después de creada**: ver sección 3.
- **Descuento de stock por venta**: es la Etapa 12 (Ventas), que va a
  consumir `Product.stock` como el motor de disponibilidad consumió
  `ProfessionalSchedule` en la Etapa 10.
- **Alertas proactivas (notificación cuando el stock cruza el mínimo)**:
  `lowStock=true` es una consulta bajo demanda; avisar activamente es
  Notificaciones (Etapa 14).

## 8. Tests

`test/products.spec.ts`: el gate del feature flag (403 sin `inventory`
habilitado, ejercitando la jerarquía completa SUPER ADMIN → Plan → Negocio
para habilitarlo); CRUD completo de productos (SKU duplicado rechazado
con 409, soft delete); ajuste manual de stock (incrementa, decrementa,
rechaza dejar el stock negativo); alerta de stock mínimo; CRUD de
proveedores; flujo completo de una compra (`pending` no toca stock →
`receive` incrementa stock y actualiza costo → no se puede recibir ni
cancelar dos veces); cancelación de una compra pendiente (no toca stock,
ya no se puede recibir después); aplicación real de
`productos.gestionar`/`inventario.gestionar`; aislamiento multi-tenant
(un tenant sin el flag habilitado recibe 403 aunque exista el módulo, y
uno con el flag habilitado igual no ve productos de otro tenant — dos
aislamientos distintos, ambos testeados). 95 tests en la suite completa
(10 nuevos de esta etapa).
