# Build multi-stage (Etapa 26, doc `../docs/30-DEPLOY.md`):
# - "build": instala TODAS las dependencias (incluye devDependencies:
#   @nestjs/cli, typescript), genera el cliente de Prisma y compila a dist/.
# - runtime: imagen final, solo dependencias de producción (`prisma` sí
#   queda — está en "dependencies", no en devDependencies, porque hace
#   falta el CLI para correr `prisma migrate deploy` como paso de deploy,
#   ver §3 del doc) + el dist/ ya compilado. Nunca corre como root.
FROM node:20-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY prisma ./prisma
RUN npx prisma generate

COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY src ./src
RUN npm run build


FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
COPY --from=build /app/prisma ./prisma
RUN npm ci --omit=dev

COPY --from=build /app/dist ./dist
# Redundante con el postinstall de @prisma/client, pero explícito: no
# depende de un detalle de implementación de una versión de Prisma en
# particular — genera el cliente ya con schema.prisma presente.
RUN npx prisma generate

RUN addgroup -S app && adduser -S app -G app
USER app

EXPOSE 3000

# GET /health (Etapa 22) ya existe para esto — lo reusa el orquestador
# (Docker/Compose/Kubernetes/lo que sea) para saber si el contenedor está
# realmente sirviendo, no solo si el proceso sigue vivo.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/api/v1/health',(r)=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

# Las migraciones NO corren automáticamente al arrancar el contenedor a
# propósito: en un deploy con más de una réplica, cada una ejecutando
# `prisma migrate deploy` al bootear generaría una carrera contra la
# tabla de migraciones de Prisma. El paso correcto es un comando aparte,
# ANTES de levantar las réplicas nuevas — ver doc `30-DEPLOY.md` §3
# ("prisma migrate deploy" como paso de deploy, mismo criterio de
# automatización explícita que scripts/run-backup.ts de la Etapa 24).
CMD ["node", "dist/main.js"]
