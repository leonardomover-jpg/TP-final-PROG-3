import { Prisma, PrismaClient } from '@prisma/client';

/**
 * Pieza central del aislamiento multi-tenant (doc 02-MULTI-TENANCY, sección 3,
 * capa de aplicación). Ningún service de negocio arma un `WHERE tenantId=...`
 * a mano: en su lugar recibe un cliente Prisma ya extendido con este filtro,
 * y cualquier find/update/delete/create sobre un modelo tenant-scoped queda
 * automáticamente acotado al tenant resuelto desde el JWT de la sesión.
 *
 * Reglas por modelo (documentadas porque no son todas iguales):
 * - User / Branch / Client / Professional / Service / ScheduleException /
 *   Appointment / WaitlistEntry / Product / Supplier / Purchase /
 *   CashRegister / Sale / Expense / Subscription / TenantFeatureFlag /
 *   AuditLog / SupportTicket / LoyaltyPointsTransaction / GiftCard /
 *   Referral / Promotion / TenantIntegration / Deposit: igualdad estricta
 *   de tenantId en todas las operaciones. Un tenant nunca ve ni escribe
 *   filas de otro tenant, punto.
 * - PurchaseItem / SaleItem / SalePayment / GiftCardTransaction: no tienen
 *   tenantId propio (cuelgan de Purchase.tenantId / Sale.tenantId /
 *   GiftCard.tenantId), no se interceptan acá — el service correspondiente
 *   valida la pertenencia del padre (y de cada Product/Service referenciado)
 *   antes de escribir.
 * - Notification: SÍ tiene tenantId propio, pero deliberadamente NO pasa
 *   por acá (doc `18-NOTIFICACIONES.md` §5) — NotificationsService es un
 *   singleton sin estado (mismo molde que FeatureFlagsService/
 *   PlanLimitsService/PlanInfoService), porque lo inyectan tanto services
 *   request-scoped (Products, Sales) como uno que NO lo es
 *   (PlanLimitsService, usado desde un Guard); necesita quedar
 *   inyectable en cualquiera de los dos sin arrastrar el bug de scope
 *   documentado en Etapas 2/5/10. Cada query de NotificationsService
 *   agrega `tenantId` a mano, igual que ya hacen esos otros services.
 * - CommunicationRead: no tiene tenantId propio — cuelga de un `userId`
 *   que NotificationsService siempre resuelve del usuario autenticado
 *   (nunca de un id que mande el cliente), así que no hay ningún tenant
 *   ajeno que "adivinar". Communication (la comunicación en sí) es una
 *   entidad de plataforma, fuera de cualquier tenant — no se toca acá.
 * - TenantHolidayOverride: mismo criterio que TenantFeatureFlag (clave
 *   compuesta [tenantId, holidayId]) — solo findMany/upsert intervenidos,
 *   ver ese bloque para el motivo.
 * - ClientNote / ProfessionalSchedule / ServiceProfessional /
 *   BranchSchedule: no tienen tenantId propio (cuelgan de Client.tenantId /
 *   Professional.tenantId / Service+Professional.tenantId /
 *   Branch.tenantId), así que no se interceptan acá — el service
 *   correspondiente valida la pertenencia del padre (o de AMBOS padres, en
 *   el caso de ServiceProfessional) antes de leer/crear (mismo motivo que
 *   Role con findUnique, doc `10-CLIENTES.md` §4).
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
        client: {
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
        professional: {
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
        service: {
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
        cashRegister: {
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
          async create({ args, query }) {
            args.data = { ...args.data, tenantId } as any; // ver "Nota de tipado" arriba
            return query(args);
          },
        },
        sale: {
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
          async create({ args, query }) {
            args.data = { ...args.data, tenantId } as any; // ver "Nota de tipado" arriba
            return query(args);
          },
        },
        expense: {
          async findMany({ args, query }) {
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
        product: {
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
          async count({ args, query }) {
            args.where = { ...args.where, tenantId };
            return query(args);
          },
          async create({ args, query }) {
            args.data = { ...args.data, tenantId } as any; // ver "Nota de tipado" arriba
            return query(args);
          },
        },
        supplier: {
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
          async create({ args, query }) {
            args.data = { ...args.data, tenantId } as any; // ver "Nota de tipado" arriba
            return query(args);
          },
        },
        purchase: {
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
          async create({ args, query }) {
            args.data = { ...args.data, tenantId } as any; // ver "Nota de tipado" arriba
            return query(args);
          },
        },
        appointment: {
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
          async count({ args, query }) {
            args.where = { ...args.where, tenantId };
            return query(args);
          },
          async create({ args, query }) {
            args.data = { ...args.data, tenantId } as any; // ver "Nota de tipado" arriba
            return query(args);
          },
        },
        waitlistEntry: {
          async findMany({ args, query }) {
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
          async create({ args, query }) {
            args.data = { ...args.data, tenantId } as any; // ver "Nota de tipado" arriba
            return query(args);
          },
        },
        scheduleException: {
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
          async delete({ args, query }) {
            args.where = { ...args.where, tenantId } as typeof args.where;
            return query(args);
          },
          async create({ args, query }) {
            args.data = { ...args.data, tenantId } as any; // ver "Nota de tipado" arriba
            return query(args);
          },
        },
        tenantHolidayOverride: {
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
        subscription: {
          async findFirst({ args, query }) {
            args.where = { ...args.where, tenantId };
            return query(args);
          },
          async findUnique({ args, query }) {
            args.where = { ...args.where, tenantId } as typeof args.where;
            return query(args);
          },
          async upsert({ args, query }) {
            args.where = { ...args.where, tenantId } as typeof args.where;
            args.create = { ...args.create, tenantId } as any; // ver "Nota de tipado" arriba
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
        loyaltyPointsTransaction: {
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
        giftCard: {
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
          async create({ args, query }) {
            args.data = { ...args.data, tenantId } as any; // ver "Nota de tipado" arriba
            return query(args);
          },
        },
        referral: {
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
          async create({ args, query }) {
            args.data = { ...args.data, tenantId } as any; // ver "Nota de tipado" arriba
            return query(args);
          },
        },
        promotion: {
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
        tenantIntegration: {
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
          async upsert({ args, query }) {
            args.where = { ...args.where, tenantId } as typeof args.where;
            args.create = { ...args.create, tenantId } as any; // ver "Nota de tipado" arriba
            return query(args);
          },
          async create({ args, query }) {
            args.data = { ...args.data, tenantId } as any; // ver "Nota de tipado" arriba
            return query(args);
          },
        },
        deposit: {
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
