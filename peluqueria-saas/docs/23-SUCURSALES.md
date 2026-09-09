# 23 — Sucursales: permisos por sucursal + inventario por sucursal (Etapa 19)

## 1. Qué problema resuelve

El roadmap pide "multi-sucursal completo: permisos por sucursal, caja/
inventario por sucursal". Caja ya estaba resuelto desde la Etapa 12
(`CashRegister`/`Sale` ya tienen `branchId` propio). Lo que faltaba:

- Que un usuario asignado a una sucursal puntual (`UserBranch`, cargado
  desde `POST /users` con `branchIds` desde la Etapa 2) **no pueda operar
  en otra** — hoy los permisos RBAC son por tenant entero, sin ninguna
  restricción de sucursal.
- Que el inventario (`Product`) se pueda acotar a una sucursal puntual en
  vez de ser siempre compartido entre todas.

## 2. Dependencias

Depende de `UserBranch` (Etapa 2, existía pero no se usaba para nada más
que informativo), `Branch`/`CashRegister`/`Sale` (ya con `branchId`),
`RolesService`/`PermissionsGuard` (RBAC, Etapa 2).

## 3. Modelo de datos

```
Product.branchId  (nuevo, nullable) — null = stock compartido entre todas
                    las sucursales del negocio (default, compatible con
                    negocios de una sola sucursal); con un valor, el stock
                    es exclusivo de esa sucursal.
Branch.products    (relación inversa)
```

Nuevo permiso `sucursales.todas`: sin él, un usuario solo puede operar
(crear turnos, ventas, abrir caja, productos) en las sucursales que
`UserBranch` le asignó. La "Administrador del negocio" (dueño, rol de
sistema creado en `register-tenant`) lo tiene automáticamente porque ese
rol incluye TODOS los permisos del catálogo — ningún negocio de una sola
sucursal nota el cambio.

## 4. `BranchAccessGuard`

`src/branches/guards/branch-access.guard.ts` — mismo criterio "opt-in por
endpoint" que `PlanLimitsGuard`/`FeatureFlagGuard`: se aplica con
`@UseGuards(BranchAccessGuard)` puntual en cada `create`/`open` que recibe
un `branchId`. Lee `branchId` de `request.body`/`request.query` (antes de
que la ValidationPipe transforme el body — los Guards de Nest corren
antes que los Pipes, mismo orden que ya usaba `PlanLimitsGuard`); si el
request no trae `branchId`, no hay nada que restringir y deja pasar. Si lo
trae, exige `sucursales.todas` O una fila en `UserBranch` para ese usuario
+ esa sucursal — si no hay ninguna de las dos, `403`.

Aplicado en: `AppointmentsController.create`, `WaitlistController.create`,
`SalesController.create`, `CashRegisterController.open`,
`ProductsController.create`/`update` (para el `branchId` del producto).

## 5. Inventario por sucursal

`ProductsService.create`/`update` aceptan `branchId` opcional (valida que
la sucursal pertenezca al tenant). `GET /products?branchId=X` devuelve los
productos de esa sucursal MÁS los compartidos (`branchId` null), nunca los
de otra sucursal puntual. `SalesService.create` agrega una validación por
ítem: si el producto tiene `branchId` propio y no coincide con el
`branchId` de la venta, `400` ("pertenece a otra sucursal y no se puede
vender desde esta") — un producto compartido (`branchId` null) se puede
vender desde cualquier sucursal, igual que antes de esta etapa.

`Purchase` (compras) sigue siendo tenant-wide, sin `branchId` propio: el
roadmap pide caja/inventario por sucursal, no compras — una compra repone
el stock del `Product` tal cual esté configurado (compartido o de una
sucursal puntual), sin necesidad de que la propia `Purchase` sepa de qué
sucursal es.

## 6. Qué NO se hizo en esta etapa (a propósito)

- **Permisos por sucursal en endpoints de LECTURA** (`GET /appointments`,
  `GET /sales`, etc.): `BranchAccessGuard` solo se aplicó en las
  mutaciones (`create`/`open`) que el roadmap señala como el problema real
  ("operar en otra sucursal"). Filtrar automáticamente los listados por
  las sucursales asignadas es un cambio de UX más amplio, no pedido en
  detalle por el roadmap — se puede sumar después sin romper nada de esta
  etapa.
- **Desasignar un producto de vuelta a "compartido"** (`branchId: null`)
  desde `PATCH /products/:id`: no hay convención de unset-a-null en
  ningún DTO de este proyecto (mismo criterio ya documentado en
  `UpdateClientDto`, etc.) — no se inventó una acá.
- **Ledger de stock por sucursal** (movimientos históricos): el stock
  sigue siendo un único contador en `Product.stock` (Etapa 11), ahora
  simplemente acotado a una sucursal cuando corresponde — no se agregó un
  historial de movimientos, fuera del alcance de esta etapa.
- **Gestión de `UserBranch` desde un endpoint dedicado**: se sigue
  cargando únicamente en `POST /users` (`branchIds`); reasignar las
  sucursales de un usuario ya existente no tiene endpoint propio en esta
  etapa.

## 7. Tests

`test/branches-multi.spec.ts` (9 tests): un usuario asignado a una sola
sucursal no puede crear turnos en otra (403) pero sí en la suya (201); el
dueño (`sucursales.todas`) opera en cualquiera sin estar asignado; mismo
criterio en lista de espera, apertura de caja y creación de ventas; un
producto exclusivo de una sucursal no se puede vender desde otra (400) y
uno compartido sí se puede vender desde cualquiera; el listado filtrado
por sucursal no expone productos exclusivos de otra sucursal. 181 tests en
la suite completa (9 nuevos).
