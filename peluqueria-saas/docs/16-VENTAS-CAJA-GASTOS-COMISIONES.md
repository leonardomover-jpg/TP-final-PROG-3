# 16 — Ventas + Caja + Gastos + Comisiones (Etapa 12)

## 1. Qué problema resuelve

Cerrar el círculo comercial: un cliente compra una mezcla de servicios y
productos, paga con más de un medio, la venta sale de una caja abierta en
esa sucursal, y al final del día esa caja se cierra contando el efectivo
real contra lo que debería haber. Además, cuánto gastó el negocio ese
turno y cuánto le corresponde de comisión a cada profesional.

## 2. Dependencias

Depende de: `Branch` (Etapa 2), `Client` (Etapa 6), `Professional` (Etapa
7, `commissionPercentage`), `Service`/`Product` (Etapas 8/11). Es
requisito de: Reportes (Etapa 20, que va a agregar estos datos en
dashboards).

## 3. Modelo de datos

```
CashRegister
  id, tenantId, branchId, status (open|closed), openedByUserId,
  openingAmount, openedAt, closedByUserId?, closingAmount?,
  expectedCashAmount?, difference?, closedAt?, notes?

Sale
  id, tenantId, branchId, cashRegisterId, clientId?, professionalId?,
  status (completed|cancelled), total, cancelReason?, createdAt, updatedAt

SaleItem
  id, saleId, itemType (service|product), serviceId?, productId?, name,
  quantity, unitPrice, subtotal

SalePayment
  id, saleId, method (cash|card|transfer|other), amount

Expense
  id, tenantId, branchId?, cashRegisterId?, category?, amount,
  description?, date, createdAt
```

Decisiones de diseño:

- **El precio de cada `SaleItem` sale SIEMPRE del catálogo**
  (`Service.price`/`Product.price`) resuelto en el servidor en el momento
  de la venta — nunca del body del request, aunque el cliente lo mande.
  Mismo principio ya aplicado con Mercado Pago en la Etapa 5: no confiar
  en el cliente para montos de dinero. `name`/`unitPrice` quedan como una
  FOTO del catálogo en ese momento (igual que `Appointment.endAt`, Etapa
  10, doc `14` §3).
- **Pagos combinados**: `SalePayment` permite más de una fila por venta
  (ej. mitad efectivo, mitad tarjeta). La suma tiene que dar exactamente
  el `total` de la venta (con una tolerancia de 1 centavo para redondeo de
  punto flotante del lado del cliente) — si no coincide, `SalesService.create`
  rechaza todo antes de escribir nada.
- **Una venta exige una `CashRegister` abierta en esa sucursal** —
  vender sin haber abierto la caja del día no es un flujo soportado; el
  `cashRegisterId` se valida (existe, pertenece al tenant, está `open`, y
  es de la sucursal indicada) antes de aceptar la venta.
- **Los ítems de producto descuentan stock en la misma transacción** que
  crea la venta — si el stock no alcanza, se rechaza todo el ítem (400)
  antes de tocar la base. Cancelar la venta repone el stock de esos ítems,
  también en una transacción.
- **El arqueo se calcula recién al cerrar la caja**
  (`CashRegisterService.close`), nunca antes:
  `expectedCashAmount = openingAmount + Σ(SalePayment.amount donde method='cash'
  y la venta está completed) − Σ(Expense.amount de esa caja)`, y
  `difference = closingAmount (contado a mano) − expectedCashAmount`. La
  diferencia se registra siempre, nunca se "ajusta" para que cierre en
  cero — es información real sobre lo que pasó ese turno.
- **Comisiones sobre el subtotal de SERVICIOS únicamente**, no sobre
  productos — un salón típicamente paga comisión por el trabajo del
  profesional, no por la reventa de un shampoo. `GET /sales/commissions`
  agrupa por profesional las ventas completadas con `professionalId`
  asignado, en el rango de fechas pedido, sumando `subtotal` de los ítems
  `service` y aplicando `Professional.commissionPercentage`. Es un
  reporte calculado al vuelo, no una liquidación persistida — eso es una
  extensión natural si aparece el caso concreto (ej. "marcar una
  comisión como pagada"), no antes.
- **`Expense.cashRegisterId` es opcional**: solo se completa cuando el
  gasto salió del efectivo de una caja abierta (así entra en el arqueo al
  cerrarla); un gasto pagado por transferencia no tiene por qué estar
  atado a ninguna caja.

## 4. Endpoints

```
POST   /cash-register/open        caja.abrir
POST   /cash-register/:id/close   caja.cerrar
GET    /cash-register?branchId=&status=   caja.ver
GET    /cash-register/:id         caja.ver

GET    /sales?from=&to=&branchId=&clientId=&professionalId=&status=  ventas.ver
GET    /sales/:id                 ventas.ver
POST   /sales                     ventas.crear
POST   /sales/:id/cancel          ventas.anular
GET    /sales/commissions?professionalId=&from=&to=   reportes.ver

GET    /expenses?branchId=&cashRegisterId=&from=&to=  gastos.ver
GET    /expenses/:id              gastos.ver
POST   /expenses                  gastos.crear
```

Los seis primeros permisos (`caja.*`, `ventas.*`, `reportes.ver`) ya
estaban sembrados desde la Etapa 2, sin ningún endpoint que los usara
hasta ahora. `gastos.ver`/`gastos.crear` son nuevos en esta etapa.

## 5. Multi-tenancy

`CashRegister`/`Sale`/`Expense` se agregaron a `tenant-scope.extension.ts`
con el mismo patrón que `User`/`Branch`/`Product`. `SaleItem`/`SalePayment`
no tienen `tenantId` propio (cuelgan de `Sale.tenantId`) y no se
interceptan — `SalesService` valida la pertenencia de `Sale` y de cada
`Service`/`Product` referenciado antes de escribir, mismo criterio que
`PurchaseItem` en la Etapa 11.

## 6. Qué NO se hizo en esta etapa (a propósito)

- **Liquidación de comisiones persistida** ("marcar como pagada", export a
  PDF): ver sección 3. El reporte de hoy es de solo lectura.
- **Comisión sobre productos**: ver sección 3 — si el pedido necesita ese
  caso, es un `commissionPercentage` separado para productos, no
  reutilizar el de servicios sin que lo pida.
- **Un turno con varios pagos parciales a lo largo del tiempo** (ej. seña
  + saldo en otro momento): esta etapa asume que todos los `SalePayment`
  de una venta se cargan juntos, al momento de crearla. Pagos diferidos
  son parte de Señas (Etapa 15, Mercado Pago para clientes).
- **Descuentos/promociones sobre el total**: el pedido los cubre en
  Fidelización (Etapa 13); esta etapa no anticipa esa lógica sin que
  exista el módulo.

## 7. Tests

`test/sales.spec.ts`: no se puede vender sin una caja abierta en esa
sucursal; no se puede abrir una segunda caja en la misma sucursal sin
cerrar la anterior; venta mixta con pagos combinados (precio siempre del
catálogo, nunca el que mande el cliente, descuenta stock, total
correcto); rechazo cuando los pagos no suman el total; rechazo por stock
insuficiente; cancelar una venta repone el stock (y no se puede cancelar
dos veces); comisiones calculadas solo sobre el subtotal de servicios;
gastos cargados a una caja abierta y cálculo real del arqueo al cerrar
(incluida la diferencia negativa cuando falta efectivo, y que una caja
cerrada ya no acepta gastos nuevos); aplicación real de
`ventas.crear`/`caja.abrir`/`gastos.crear`; aislamiento multi-tenant
completo (ventas, y que un tenant no puede vender usando la caja/sucursal/
servicio de otro tenant aunque adivine sus ids). 105 tests en la suite
completa (10 nuevos de esta etapa).
