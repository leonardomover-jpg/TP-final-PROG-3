import { Prisma, PrismaClient } from '@prisma/client';

/**
 * Pieza central del aislamiento multi-tenant (doc 02-MULTI-TENANCY, sección 3,
 * capa de aplicación). Ningún service de negocio arma un `WHERE tenantId=...`
 * a mano: en su lugar recibe un cliente Prisma ya extendido con este filtro,
 * y cualquier find/update/delete/create sobre un modelo tenant-scoped queda
 * automáticamente acotado al tenant resuelto desde el JWT de la sesión.
 *
 * Reglas por modelo (documentadas porque no son todas iguales):
 * - User / Branch / Subscription / TenantFeatureFlag / AuditLog / SupportTicket:
 *   igualdad estricta de tenantId en todas las operaciones. Un tenant nunca
 *   ve ni escribe filas de otro tenant, punto.
 * - Role: puede ser un rol de sistema (tenantId null, compartido y de solo
 *   lectura entre tenants) o un rol propio del tenant. Las lecturas
 *   (findMany/findFirst/count) devuelven "propios del tenant" OR "de
 *   sistema"; las escrituras (create/update/delete) exigen igualdad estricta
 *   de tenantId, lo que en la práctica impide modificar/borrar un rol de
 *   sistema desde un cliente tenant-scoped (su tenantId es null, nunca va a
 *   matchear el tenantId actual). `findUnique` no se intercepta acá a
 *   propósito (una búsqueda por id ya es inequívoca); RolesService valida la
 *   pertenencia (tenantId === actual || tenantId === null) después de leer.
 */
// Nota de tipado: en los hooks de create/upsert de abajo, Prisma tipa `data`
// como una union discriminada estricta ("con `tenant` (relacion)" XOR "con
// `tenantId` (escalar)"), y el objeto fusionado en runtime no encaja
// limpiamente en ninguna de las dos ramas aunque sea perfectamente valido
// para Postgres. Se castea puntualmente ahi adentro (nunca en los services
// que llaman a `.create`, que siguen totalmente tipados) - es la forma
// practica de expresar "estas dos formas de crear la fila son equivalentes"
// sin reescribir los tipos generados por Prisma.
export function tenantScopeExtension(tenantId: string) {
  return Prisma.defineExtension({
      name: `tenant-scope`,
      query: {
        user: {
          async findMany({ args, query }) {
            args.where = { ...args.where, tenantId };
            return query(args);
          },
          async findFirst({ args, query }) {
            args.where = { ...args.where, tenantId };
            return query(args);
          },
          async findUnique({ args, query }) {
            args.where = { ...args.where, tenantId } as typeof args.where;
            return query(args);
          },
          async update({ args, query }) {
            args.where = { ...args.where, tenantId } as typeof args.where;
            return query(args);
          },
          async updateMany({ args, query }) {
            args.where = { ...args.where, tenantId };
            return query(args);
          },
          async delete({ args, query }) {
            args.where = { ...args.where, tenantId } as typeof args.where;
            return query(args);
          },
          async deleteMany({ args, query }) {
            args.where = { ...args.where, tenantId };
            return query(args);
          },
          async count({ args, query }) {
            args.where = { ...args.where, tenantId };
            return query(args);
          },
          async create({ args, query }) {
            args.data = { ...args.data, tenantId } as any; // ver "Nota de tipado" arriba
            return query(args);
          },
        },
        branch: {
          async findMany({ args, query }) {
            args.where = { ...args.where, tenantId };
            return query(args);
          },
          async findFirst({ args, query }) {
            args.where = { ...args.where, tenantId };
            return query(args);
          },
          async findUnique({ args, query }) {
            args.where = { ...args.where, tenantId } as typeof args.where;
            return query(args);
          },
          async update({ args, query }) {
            args.where = { ...args.where, tenantId } as typeof args.where;
            return query(args);
          },
          async delete({ args, query }) {
            args.where = { ...args.where, tenantId } as typeof args.where;
            return query(args);
          },
          async count({ args, query }) {
            args.where = { ...args.where, tenantId };
            return query(args);
          },
          async create({ args, query }) {
            args.data = { ...args.data, tenantId } as any; // ver "Nota de tipado" arriba
            return query(args);
          },
        },
        subscription: {
          async findFirst({ args, query }) {
            args.where = { ...args.where, tenantId };
            return query(args);
          },
          async findUnique({ args, query }) {
            args.where = { ...args.where, tenantId } as typeof args.where;
            return query(args);
          },
        },
        tenantFeatureFlag: {
          async findMany({ args, query }) {
            args.where = { ...args.where, tenantId };
            return query(args);
          },
          async upsert({ args, query }) {
            args.where = { ...args.where, tenantId } as typeof args.where;
            args.create = { ...args.create, tenantId } as any; // ver "Nota de tipado" arriba
            return query(args);
          },
        },
        auditLog: {
          async findMany({ args, query }) {
            args.where = { ...args.where, tenantId };
            return query(args);
          },
          async create({ args, query }) {
            args.data = { ...args.data, tenantId } as any; // ver "Nota de tipado" arriba
            return query(args);
          },
        },
        supportTicket: {
          async findMany({ args, query }) {
            args.where = { ...args.where, tenantId };
            return query(args);
          },
          async findFirst({ args, query }) {
            args.where = { ...args.where, tenantId };
            return query(args);
          },
          async findUnique({ args, query }) {
            args.where = { ...args.where, tenantId } as typeof args.where;
            return query(args);
          },
          async create({ args, query }) {
            args.data = { ...args.data, tenantId } as any; // ver "Nota de tipado" arriba
            return query(args);
          },
        },
        role: {
          async findMany({ args, query }) {
            args.where = {
              AND: [args.where ?? {}, { OR: [{ tenantId }, { tenantId: null }] }],
            };
            return query(args);
          },
          async findFirst({ args, query }) {
            args.where = {
              AND: [args.where ?? {}, { OR: [{ tenantId }, { tenantId: null }] }],
            };
            return query(args);
          },
          async count({ args, query }) {
            args.where = {
              AND: [args.where ?? {}, { OR: [{ tenantId }, { tenantId: null }] }],
            };
            return query(args);
          },
          async create({ args, query }) {
            args.data = { ...args.data, tenantId } as any; // ver "Nota de tipado" arriba
            return query(args);
          },
          async update({ args, query }) {
            args.where = { ...args.where, tenantId } as typeof args.where;
            return query(args);
          },
          async delete({ args, query }) {
            args.where = { ...args.where, tenantId } as typeof args.where;
            return query(args);
          },
        },
      },
  });
}

// Helper de tipado: tomar el ReturnType directamente de `prisma.$extends`
// (un método genérico/sobrecargado) infiere mal y termina en `unknown` en
// los services que consumen TenantPrismaService. Envolviéndolo en una
// función concreta, TypeScript sí puede inferir el tipo real del cliente
// extendido a partir de una llamada real con argumentos concretos.
export function extendWithTenantScope(prisma: PrismaClient, tenantId: string) {
  return prisma.$extends(tenantScopeExtension(tenantId));
}

export type TenantScopedPrismaClient = ReturnType<typeof extendWithTenantScope>;
