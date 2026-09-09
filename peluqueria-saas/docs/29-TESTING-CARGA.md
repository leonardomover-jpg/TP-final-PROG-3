# 29 — Testing end-to-end y de carga (Etapa 25)

## 1. Qué pide esta etapa

Doc `06-ROADMAP-ETAPAS.md`: "Testing end-to-end y de carga: escenarios de
escalabilidad (10 → 10.000 negocios simulados)." Dos cosas distintas,
tratadas por separado abajo: un test end-to-end (un flujo real
encadenado, no módulos aislados) y un load test (¿la plataforma sigue
respondiendo rápido con miles de negocios?).

## 2. Load test: la pregunta real detrás de "10 → 10.000 negocios"

La pregunta que importa no es "¿el sistema soporta 10.000 filas en la
tabla `Tenant`?" (eso lo soporta cualquier base moderna sin esfuerzo) sino
**"¿leer los datos de UN negocio se pone más lento a medida que la
plataforma tiene más y más negocios?"** — si la respuesta fuera sí, el
sistema no escala aunque cada tenant individual ande bien hoy con unos
pocos cientos de negocios de prueba.

### 2.1 Por qué corre contra una base descartable, no la de dev/test

`scripts/load-test/run-load-test.ts` NUNCA toca la base de dev/test
compartida (la reutiliza toda la suite de Jest, y ya acumula miles de
tenants de tests anteriores). Mismo patrón que `verifyByRestore` de la
Etapa 24: crea una base Postgres descartable (`createdb`), le aplica las
migraciones (`prisma migrate deploy`), corre el experimento completo
ahí adentro, y la borra en un `finally` — pase lo que pase. Poblar la
base compartida con 10.000 tenants sintéticos la habría dejado
permanentemente más pesada para cada test de cada etapa siguiente, un
costo que no hacía falta pagar.

### 2.2 Metodología

1. Se crea un **tenant de referencia**, con sus propios clientes, ANTES
   que cualquier otro. Es al único al que se le mide latencia — la
   pregunta es si sus datos se leen más lento a medida que se agregan
   miles de tenants DESPUÉS que él, no cuánto tarda un tenant recién
   creado (eso ya lo cubren los tests normales).
2. En cada checkpoint (10, 100, 1.000, 10.000 tenants totales en la
   plataforma) se generan por lotes (`createMany`, tandas de 500) los
   tenants sintéticos que faltan para llegar ahí, cada uno con 20
   clientes — la tabla `Client` crece proporcionalmente en TODOS los
   tenants, no solo en el de referencia, porque si solo el tenant de
   referencia tuviera filas el benchmark no probaría nada sobre
   escalabilidad real.
3. En cada checkpoint se corre 200 veces la MISMA query que
   `ClientsService.findAll` ejecuta en producción vía
   `TenantPrismaService` (`SELECT * FROM "Client" WHERE tenantId = $1 AND
   deletedAt IS NULL ORDER BY createdAt DESC LIMIT 20` — ahí el tenantId
   lo inyecta la extensión sola; acá, hablando directo con Postgres, se
   pasa a mano, pero es la MISMA sentencia SQL) contra el tenant de
   referencia, y se calculan p50/p95/p99/max.
4. En el checkpoint más grande se corre además `EXPLAIN ANALYZE` sobre
   esa misma query, para ver el plan real (no solo el tiempo).

### 2.3 Resultado real (corrida completa, `npm run loadtest:run`)

| Tenants en la plataforma | Filas en `Client` | p50 | p95 | p99 | max |
|---|---|---|---|---|---|
| 10 | 200 | 1.20 ms | 1.45 ms | 1.90 ms | 2.78 ms |
| 100 | 2.000 | 1.25 ms | 1.55 ms | 2.31 ms | 2.43 ms |
| 1.000 | 20.000 | 1.27 ms | 1.71 ms | 1.93 ms | 2.13 ms |
| 10.000 | 200.000 | 1.17 ms | 1.44 ms | 1.58 ms | 2.06 ms |

La latencia de leer los datos del tenant de referencia se mantiene
**plana** (~1.2 ms de mediana) desde 10 hasta 10.000 negocios en la
plataforma, con 200.000 filas totales en la tabla `Client` — no hay
degradación medible. `EXPLAIN ANALYZE` en el checkpoint de 10.000
confirma por qué:

```
Limit  (cost=16.27..16.27 rows=3 width=292) (actual time=0.028..0.030 rows=20 loops=1)
  ->  Sort  (cost=16.27..16.27 rows=3 width=292) (actual time=0.027..0.028 rows=20 loops=1)
        Sort Key: "createdAt" DESC
        ->  Bitmap Heap Scan on "Client"  (actual time=0.017..0.020 rows=20 loops=1)
              Recheck Cond: (("tenantId" = '...') AND ("deletedAt" IS NULL))
              ->  Bitmap Index Scan on "Client_tenantId_deletedAt_idx" (actual time=0.011..0.011 rows=20 loops=1)
Execution Time: 0.048 ms
```

`Bitmap Index Scan on "Client_tenantId_deletedAt_idx"` — el planner usa
el índice compuesto `@@index([tenantId, deletedAt])` del schema (doc `02`
§4), no un `Seq Scan` sobre las 200.000 filas. Es la razón estructural
por la que la latencia no depende del total de tenants en la
plataforma: el costo de la query depende del tamaño de LOS DATOS DE ESE
TENANT (fijo, 20 clientes), no del tamaño de la tabla completa.

### 2.4 Por qué esto también justifica 10.000 → más allá

El resultado no es "funcionó hasta 10.000 por casualidad": es la
consecuencia directa de un índice B-tree, cuyo costo de búsqueda es
`O(log n)` sobre el TOTAL de filas y luego `O(k)` sobre las `k` filas que
matchean el tenant — ninguno de los dos términos depende de CUÁNTOS
tenants hay, solo de cuántas filas tiene ESE tenant. El mismo plan de
`EXPLAIN ANALYZE` se mantiene con 100.000 o 1.000.000 de tenants; lo
que hace falta corroborar en un ambiente de staging real antes de un
lanzamiento a esa escala es el comportamiento del connection pool y el
tamaño físico de la base en disco, no la forma de esta curva.

## 3. Test end-to-end: un flujo real, no módulos aislados

Cada `*.spec.ts` existente prueba un módulo por su cuenta (Ventas por su
lado, Turnos por su lado, Reportes por su lado) — cobertura necesaria
pero no prueba que los módulos se lleven bien entre sí en un flujo real.
`test/e2e-business-flow.spec.ts` (nuevo) encadena, en un solo test:

alta del negocio → sucursal principal (automática) → profesional con
horario semanal → servicio habilitado para ese profesional → producto
en stock (plan Premium + feature flag `inventory`) → **reserva pública
sin login** (crea el cliente solo) → el cliente aparece del lado
autenticado → confirmación del turno → apertura de caja → venta mixta
(el servicio del turno + el producto, pago combinado efectivo/tarjeta)
→ el stock bajó de verdad → turno completado → cierre de caja →
`GET /reports/dashboard` refleja la venta y el turno → `GET /audit`
tiene la entrada automática de la venta (`AuditInterceptor`, Etapa 22,
sin que `SalesController` escriba nada a mano) → `GET /health` sigue
respondiendo `ok`.

Si cualquier paso intermedio rompiera lo que necesita el siguiente (ej.
el cliente creado sin login no apareciera del lado autenticado, o la
venta no descontara stock de verdad, o el dashboard no reflejara una
venta recién hecha), este test lo detecta — ninguno de los tests
aislados por módulo lo haría, porque cada uno arma su propio fixture
desde cero.

## 4. Qué NO se hizo en esta etapa (a propósito)

- **Poblar la base de dev/test compartida con miles de tenants**:
  deliberadamente evitado (§2.1) — habría degradado la velocidad de la
  suite completa para siempre, a cambio de nada (el load test ya prueba
  lo que hace falta probar, en una base descartable).
- **Load test de throughput HTTP** (miles de requests/segundo contra el
  servidor Nest levantado, tipo `autocannon`/`k6`): fuera de alcance —
  el cuello de botella real de "10 → 10.000 negocios" es la base de
  datos (cada negocio nuevo agrega filas, no requests concurrentes por
  sí solo), que es exactamente lo que mide este load test. El
  throughput HTTP del framework depende de cuántas instancias del
  proceso Node corren detrás de un balanceador, una decisión de
  infraestructura de deploy (Etapa 26), no de este código.
- **Ambiente de staging real con 10.000 negocios de verdad**: no existe
  todavía un ambiente de staging separado del de desarrollo (Etapa 26);
  la corrida de este load test es la evidencia disponible hoy, con el
  razonamiento de por qué se sostiene a mayor escala (§2.4).

## 5. Cómo correrlo

```bash
npm run loadtest:run
# corrida rápida, checkpoints más chicos:
LOAD_TEST_CHECKPOINTS="10,100" npm run loadtest:run
```

## 6. Tests

`test/e2e-business-flow.spec.ts` (1 test, nuevo): el flujo completo de
punta a punta descripto en §3. 216 tests en la suite completa (1 nuevo
— el load test en sí no es parte de la suite de Jest: corre contra una
base descartable propia, no la de test, y se invoca aparte con `npm run
loadtest:run`, ver §5).
