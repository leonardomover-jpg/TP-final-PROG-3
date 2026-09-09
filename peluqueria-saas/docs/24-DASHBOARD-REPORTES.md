# 24 — Dashboard, Estadísticas y Reportes (PDF/CSV/Excel) (Etapa 20)

## 1. Qué problema resuelve

Que un negocio pueda ver un resumen de su actividad (ventas, turnos,
gastos, alertas de stock) y exportar el detalle de ventas/turnos en los
tres formatos que pide el roadmap, sin tener que armar planillas a mano.

## 2. Dependencias

Depende de `Sale`/`SaleItem` (Etapa 12), `Appointment` (Etapa 10),
`Expense` (Etapa 12), `Product` (Etapa 11). Paquetes nuevos: `pdfkit`
(generación de PDF) y `exceljs` (generación de `.xlsx`) — CSV se arma a
mano (RFC 4180 básico), sin dependencia extra.

## 3. Endpoints

```
GET /reports/dashboard?from=&to=&branchId=          reportes.ver
GET /reports/sales/export?from=&to=&branchId=&format=csv|pdf|xlsx   reportes.ver
GET /reports/appointments/export?from=&to=&branchId=&format=csv|pdf|xlsx   reportes.ver
```

`reportes.ver` ya existía en el catálogo de permisos desde la Etapa 12
(usado por `GET /sales/commissions`) — se reusa tal cual, sin crear uno
nuevo.

## 4. `GET /reports/dashboard`

Devuelve, para el rango `from`/`to` (sin rango = todo el historial) y
`branchId` opcional:

```json
{
  "period": { "from": null, "to": null },
  "sales": { "count": 12, "totalRevenue": 145000 },
  "expenses": { "totalAmount": 20000 },
  "netRevenue": 125000,
  "appointmentsByStatus": [{ "status": "completed", "count": 8 }, ...],
  "topServices": [{ "name": "Corte", "subtotal": 60000, "quantity": 12 }, ...],
  "topProducts": [{ "name": "Shampoo", "subtotal": 15000, "quantity": 5 }, ...],
  "lowStockProductsCount": 2
}
```

`topServices`/`topProducts` son los 5 de mayor facturación en el período
(agregados sobre `SaleItem.subtotal`). `lowStockProductsCount` reusa el
mismo criterio que `GET /products?lowStock=true` (Etapa 11).

**Decisión técnica importante**: `ReportsService` arma estos totales con
`findMany` + agregación en memoria, **no** con `groupBy`/`aggregate` de
Prisma. `tenant-scope.extension.ts` (doc `02-MULTI-TENANCY.md` §3) solo
intercepta `findMany`/`findFirst`/`findUnique`/`create`/`update` por
modelo — `groupBy`/`aggregate` NO están interceptados ahí. Usarlos
directamente habría agregado datos de TODOS los tenants a la vez, un
agujero real de aislamiento multi-tenant. Mismo motivo por el que
`SalesService.getCommissions` (Etapa 12) ya evitaba `groupBy` desde antes
de esta etapa — acá se siguió el mismo criterio en vez de agregar
excepciones nuevas al extension.

## 5. Exports (CSV/PDF/Excel)

`src/reports/export-formats.ts` — tres funciones puras
(`buildCsv`/`buildXlsx`/`buildPdf`) parametrizadas por columnas + filas,
compartidas entre el reporte de ventas y el de turnos (mismo criterio que
`mercado-pago-client.ts`/`meta-client.ts`: una sola implementación por
formato, no una por reporte). El PDF es una tabla simple por texto
(`pdfkit` no trae tablas nativas) con salto de página automático.

## 6. Qué NO se hizo en esta etapa (a propósito)

- **Dashboard visual/gráficos**: esto es una API JSON con los números —
  el armado de gráficos es responsabilidad de un frontend que no existe
  todavía en este repo (mismo motivo que la Etapa 18).
- **Reportes de otros módulos** (fidelización, gift cards, referidos):
  el roadmap pide "Dashboard, Estadísticas y Reportes" en general, sin
  detallar qué entidades — se cubrieron ventas/turnos/gastos/stock, el
  núcleo operativo diario de un negocio; se puede extender el mismo
  patrón (`buildCsv`/`buildXlsx`/`buildPdf`) a otros reportes después sin
  romper nada de esta etapa.
- **Reportes programados/por email**: solo bajo demanda (`GET .../export`
  sincrónico); no hay jobs en background todavía (mismo motivo de
  restricción que WhatsApp/Instagram/Facebook, Etapas 16/17).
- **Gráficos de series temporales** (ventas por día/semana): el
  dashboard devuelve totales agregados del período completo, no una
  serie punto a punto — se puede sumar después si se pide en detalle.

## 7. Tests

`test/reports.spec.ts` (9 tests): dashboard con ventas/turnos/top
servicios reales; respeta el rango `from`/`to`; export de ventas en los
tres formatos (CSV con las filas esperadas, XLSX con la firma de zip
"PK", PDF con la firma "%PDF"); export de turnos incluye el servicio y
estado; un `format` inválido es rechazado por el DTO (400); sin
`reportes.ver` responde 403; aislamiento multi-tenant (un negocio nuevo
no ve la venta de otro). 190 tests en la suite completa (9 nuevos).
