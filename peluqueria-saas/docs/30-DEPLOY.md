# 30 — Deploy (Etapa 26)

## 1. Qué pide esta etapa

Doc `06-ROADMAP-ETAPAS.md`: "Deploy y Documentación final." No hay un
proveedor cloud elegido para este proyecto (es un TP, no un negocio con
infraestructura contratada) — lo que se puede entregar honestamente es
una imagen de contenedor correcta y reproducible, más la documentación
de cómo correrla en cualquier lado que hable Docker, no un manifiesto
atado a un proveedor específico (eso es una decisión de quien lo
despliegue de verdad, ver §5).

## 2. Imagen Docker: `backend/Dockerfile`

Build multi-stage:

1. **`build`** (`node:20-alpine`): instala TODAS las dependencias
   (incluye devDependencies — `@nestjs/cli`, `typescript`), corre
   `prisma generate` y `npm run build` (`nest build`, usa
   `tsconfig.build.json`).
2. **`runtime`** (`node:20-alpine`, imagen final): solo dependencias de
   producción (`npm ci --omit=dev`) + el `dist/` ya compilado del stage
   anterior. Corre como usuario no-root (`addgroup`/`adduser`, nunca
   root). `HEALTHCHECK` reusa `GET /health` (Etapa 22) — el mismo
   endpoint que ya usa cualquier orquestador para saber si el contenedor
   realmente sirve tráfico, no solo si el proceso sigue vivo.

`prisma` (el CLI, no solo `@prisma/client`) se movió de
`devDependencies` a `dependencies` en `package.json` — hace falta en
runtime para correr `prisma migrate deploy` como paso de deploy (§3), y
mezclarlo con el resto de las devDependencies (`jest`, `ts-jest`,
`ts-node`, `@nestjs/testing`...) habría inflado la imagen final sin
necesidad.

### 2.1 `binaryTargets`: por qué se tocó el schema

`generator client` ahora declara `binaryTargets = ["native",
"linux-musl-openssl-3.0.x"]`. Sin esto, `prisma generate` solo produce
el motor de la plataforma donde corre — en este proyecto, este sandbox
de desarrollo es Ubuntu (glibc); `node:20-alpine` es musl. Un cliente
generado únicamente para "native" en desarrollo no tendría el motor
correcto para el contenedor. Con el target explícito, `npm run
prisma:generate` en desarrollo sigue generando el motor de siempre
("native") y AHORA TAMBIÉN el de Alpine — verificado: tras el cambio,
`node_modules/.prisma/client/` tiene los dos binarios
(`libquery_engine-debian-openssl-3.0.x.so.node` y
`libquery_engine-linux-musl-openssl-3.0.x.so.node`), y la suite completa
de 216 tests sigue pasando sin cambios (corre con el motor "native").

### 2.2 Por qué las migraciones NO corren solas al arrancar el contenedor

El `CMD` de la imagen es únicamente `node dist/main.js` — a propósito
NO encadena `prisma migrate deploy && node dist/main.js`. Con más de
una réplica del contenedor (el caso real de un negocio con tráfico),
cada una correría `migrate deploy` al bootear, compitiendo por la misma
tabla de migraciones de Prisma. El paso correcto es un comando aparte,
ANTES de levantar las réplicas nuevas — mismo criterio de
"automatización explícita, no implícita" ya aplicado a los backups
(Etapa 24, `scripts/run-backup.ts`) y a los recordatorios de WhatsApp
(Etapas 16/17): el "cómo" ya está resuelto (`npm run
prisma:migrate:deploy`, ya existía desde antes de esta etapa), el
"cuándo/desde dónde" lo decide quien despliegue.

### 2.3 Bug real encontrado y corregido en esta etapa

Al intentar el build de producción (`npm run build`, que usa `nest
build` + `tsconfig.build.json`, distinto de `tsc --noEmit` que se venía
usando para validar cada etapa) apareció un error real:
`tsconfig.build.json` no excluía `scripts/` (agregado en la Etapa 24
para `scripts/run-backup.ts`, y ahora también `scripts/load-test/` de
la Etapa 25) — `nest build` intentaba compilarlos como si fueran parte
de `src/`, y fallaba porque están fuera de `rootDir: "src"`. Corregido
agregando `"scripts"` al `exclude` de `tsconfig.build.json`. Es un bug
real que llevaba dos etapas sin detectarse porque la validación de cada
etapa usaba `tsc --noEmit` (que no aplica `rootDir` de
`tsconfig.build.json`), no el build real de producción — la lección
concreta: `tsc --noEmit` valida tipos, no necesariamente el mismo build
que corre en producción. Confirmado corregido: `npm run build` genera
`dist/main.js` limpio, y la suite completa de 216 tests sigue pasando.

## 3. Variables de entorno requeridas en producción

Mismo catálogo documentado en `backend/.env.example` desde la Etapa 2 en
adelante, sin cambios nuevos en esta etapa salvo `BACKUP_DIR` (Etapa 24).
Resumen de las obligatorias: `DATABASE_URL`, `JWT_ACCESS_SECRET` /
`JWT_REFRESH_SECRET`, `PLATFORM_ADMIN_JWT_ACCESS_SECRET` /
`PLATFORM_ADMIN_JWT_REFRESH_SECRET` (deben ser DISTINTOS de los de
negocio), `SUPER_ADMIN_BOOTSTRAP_EMAIL` / `SUPER_ADMIN_BOOTSTRAP_PASSWORD`
(solo se leen al correr el seed), `TENANT_SECRETS_ENCRYPTION_KEY`
(`openssl rand -hex 32`). El resto (Mercado Pago, WhatsApp/Meta, IA,
`BACKUP_DIR`) son opcionales — su ausencia solo desactiva esa
integración puntual con un error claro, no rompe el resto del sistema
(mismo criterio documentado en cada etapa correspondiente).

## 4. Cómo correrlo

```bash
# Build de la imagen
cd peluqueria-saas/backend
docker build -t peluqueria-saas-backend .

# Orquestación completa (backend + Postgres) con Docker Compose
cd peluqueria-saas
cp backend/.env.example backend/.env   # completar secretos reales
docker compose up --build

# Una sola vez (o en cada deploy con cambios de schema), ANTES de
# levantar tráfico nuevo — ver §2.2:
docker compose run --rm backend npx prisma migrate deploy
docker compose run --rm backend npm run prisma:seed   # primera vez
```

## 5. Qué NO se hizo en esta etapa (a propósito)

- **Manifiestos de un proveedor cloud específico** (Kubernetes, ECS,
  Cloud Run, Railway, Fly.io...): no hay un proveedor elegido para este
  proyecto — cualquiera de esos manifiestos habría sido una decisión
  inventada sin un negocio real detrás para validarla. `docker-compose.yml`
  es la pieza que sí es honesta: corre en cualquier máquina con Docker,
  sin asumir un proveedor.
- **Migraciones automáticas al arrancar el contenedor**: descartado a
  propósito (§2.2) — correcto para una sola réplica, incorrecto (carrera
  de escrituras) para más de una, que es el caso real de un negocio con
  tráfico.
- **`docker build`/`docker compose up` ejecutados de punta a punta en
  este sandbox**: el daemon de Docker no está disponible acá (contenedor
  sin privilegio para anidar otro Docker — `dockerd` falla al arrancar
  con "ulimit: error setting limit (Operation not permitted)", un límite
  del propio sandbox, no del Dockerfile). En su lugar, se validó cada
  paso que el Dockerfile ejecuta, de forma real, fuera del contenedor:
  - **Etapa de build**: desde una copia limpia (`package.json` +
    `package-lock.json` + `prisma/` + `tsconfig*` + `src/`, exactamente
    los archivos que copia el stage `build`), `npm ci` + `prisma generate`
    + `npm run build` — generó `dist/main.js` sin errores.
  - **Etapa de runtime**: desde otra copia limpia (`package.json` +
    `package-lock.json` + `prisma/`, lo que copia el stage `runtime`
    antes de instalar), `npm ci --omit=dev` + `dist/` copiado + `prisma
    generate` — instaló SOLO con las dependencias de producción, sin
    devDependencies.
  - **Arranque real**: `node dist/main.js` desde esa copia mínima,
    apuntando a la base Postgres real de este proyecto —
    `GET /health` respondió `{"status":"ok","database":"ok",...}`, con
    todas las rutas de la aplicación completa registradas en el log de
    arranque.
  - Lo único que esta validación NO cubre es la capa de contenedor en sí
    (aislamiento, red interna de Compose, el motor musl de Alpine
    ejecutándose de verdad en vez de solo generado — ver §2.1). Se
    recomienda correr `docker compose up --build` una vez en cualquier
    máquina con Docker antes de un despliegue real, como último chequeo.
- **CI/CD** (pipeline de build+test+deploy automático en cada push):
  fuera de alcance — no hay un proveedor de CI elegido para este
  repositorio; los comandos de `package.json` (`npm run build`, `npm
  test`) ya son exactamente lo que un pipeline correría, listos para
  conectarse al que se elija.

## 6. Verificación final de la suite completa

`npm run build` (limpio, `dist/main.tsbuildinfo` y `dist/` borrados
antes) + `npx jest --runInBand`: **216/216 tests pasando**, sin cambios
respecto a la Etapa 25 — los cambios de esta etapa son de packaging
(Dockerfile, `binaryTargets`, la corrección de `tsconfig.build.json`),
no de comportamiento de la aplicación.
