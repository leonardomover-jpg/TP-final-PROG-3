// Seed de plataforma: catálogo global de permisos + roles de sistema
// predefinidos (doc 02-MULTI-TENANCY §6.4, doc 06-ROADMAP Etapa 2 §7) +
// bootstrap del primer PlatformAdmin (Etapa 3, doc 07-SUPER-ADMIN).
// Idempotente: se puede correr varias veces sin duplicar nada.
import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

const PERMISSIONS: { key: string; module: string; description: string }[] = [
  { key: 'usuarios.ver', module: 'usuarios', description: 'Ver usuarios del negocio' },
  { key: 'usuarios.crear', module: 'usuarios', description: 'Crear usuarios' },
  { key: 'usuarios.editar', module: 'usuarios', description: 'Editar usuarios' },
  { key: 'usuarios.eliminar', module: 'usuarios', description: 'Eliminar (dar de baja) usuarios' },

  { key: 'roles.ver', module: 'roles', description: 'Ver roles y permisos' },
  { key: 'roles.crear', module: 'roles', description: 'Crear roles' },
  { key: 'roles.editar', module: 'roles', description: 'Editar roles' },
  { key: 'roles.eliminar', module: 'roles', description: 'Eliminar roles' },

  { key: 'sucursales.ver', module: 'sucursales', description: 'Ver sucursales' },
  { key: 'sucursales.crear', module: 'sucursales', description: 'Crear sucursales' },
  { key: 'sucursales.editar', module: 'sucursales', description: 'Editar sucursales' },
  { key: 'sucursales.eliminar', module: 'sucursales', description: 'Eliminar sucursales' },

  // Permisos de módulos que se implementan en etapas siguientes (doc
  // 06-ROADMAP): se seedean ahora porque el catálogo de permisos es único y
  // centralizado (principio del punto 95 del pedido) — no hay endpoints
  // todavía que los usen, y eso es intencional, no un olvido.
  { key: 'clientes.ver', module: 'clientes', description: 'Ver clientes' },
  { key: 'clientes.crear', module: 'clientes', description: 'Crear clientes' },
  { key: 'clientes.editar', module: 'clientes', description: 'Editar clientes' },
  { key: 'clientes.eliminar', module: 'clientes', description: 'Eliminar clientes' },

  { key: 'profesionales.ver', module: 'profesionales', description: 'Ver profesionales' },
  { key: 'profesionales.crear', module: 'profesionales', description: 'Crear profesionales' },
  { key: 'profesionales.editar', module: 'profesionales', description: 'Editar profesionales (incluye horarios)' },
  { key: 'profesionales.eliminar', module: 'profesionales', description: 'Eliminar profesionales' },

  { key: 'servicios.ver', module: 'servicios', description: 'Ver servicios' },
  { key: 'servicios.crear', module: 'servicios', description: 'Crear servicios' },
  {
    key: 'servicios.editar',
    module: 'servicios',
    description: 'Editar servicios (incluye profesionales habilitados)',
  },
  { key: 'servicios.eliminar', module: 'servicios', description: 'Eliminar servicios' },

  { key: 'turnos.ver', module: 'turnos', description: 'Ver turnos' },
  { key: 'turnos.crear', module: 'turnos', description: 'Crear turnos' },
  { key: 'turnos.editar', module: 'turnos', description: 'Editar turnos' },
  { key: 'turnos.cancelar', module: 'turnos', description: 'Cancelar turnos' },

  { key: 'ventas.ver', module: 'ventas', description: 'Ver ventas' },
  { key: 'ventas.crear', module: 'ventas', description: 'Registrar ventas' },
  { key: 'ventas.anular', module: 'ventas', description: 'Anular ventas' },

  { key: 'caja.ver', module: 'caja', description: 'Ver movimientos de caja' },
  { key: 'caja.abrir', module: 'caja', description: 'Abrir caja' },
  { key: 'caja.cerrar', module: 'caja', description: 'Cerrar caja' },

  { key: 'reportes.ver', module: 'reportes', description: 'Ver reportes' },
  { key: 'estadisticas.ver', module: 'reportes', description: 'Ver estadísticas' },

  { key: 'productos.gestionar', module: 'productos', description: 'Gestionar productos' },
  { key: 'inventario.gestionar', module: 'inventario', description: 'Gestionar inventario' },

  { key: 'soporte.ver', module: 'soporte', description: 'Ver tickets de soporte del negocio' },
  { key: 'soporte.crear', module: 'soporte', description: 'Crear tickets de soporte' },

  { key: 'feature_flags.ver', module: 'feature_flags', description: 'Ver módulos disponibles para el negocio' },
  {
    key: 'feature_flags.gestionar',
    module: 'feature_flags',
    description: 'Activar/desactivar módulos opcionales del negocio',
  },

  { key: 'suscripcion.ver', module: 'suscripcion', description: 'Ver el estado de la suscripción del negocio' },
  {
    key: 'suscripcion.gestionar',
    module: 'suscripcion',
    description: 'Elegir/cambiar de plan y generar pagos de la suscripción',
  },
];

// Catálogo inicial de módulos opcionales (punto 10 del pedido, sección
// "FEATURE FLAGS Y MÓDULOS OPCIONALES"). SUPER ADMIN puede agregar más o
// deshabilitar cualquiera de estos en runtime — esto es solo el arranque.
const FEATURE_FLAGS: { key: string; name: string; description: string }[] = [
  { key: 'points', name: 'Puntos', description: 'Sistema de fidelización por puntos' },
  { key: 'gift_cards', name: 'Gift Cards', description: 'Tarjetas de regalo' },
  { key: 'referrals', name: 'Referidos', description: 'Programa de referidos entre clientes' },
  { key: 'whatsapp', name: 'WhatsApp', description: 'Integración con WhatsApp Business Platform (Meta)' },
  { key: 'instagram', name: 'Instagram', description: 'Integración con Instagram (Meta)' },
  { key: 'facebook', name: 'Facebook', description: 'Integración con Facebook (Meta)' },
  { key: 'ai', name: 'Inteligencia Artificial', description: 'Asistencia con IA sobre estadísticas y clientes' },
  { key: 'inventory', name: 'Inventario', description: 'Gestión de inventario de productos' },
  { key: 'branches', name: 'Sucursales', description: 'Soporte para múltiples sucursales' },
  { key: 'waitlist', name: 'Lista de espera', description: 'Lista de espera de turnos' },
  { key: 'advanced_reports', name: 'Reportes avanzados', description: 'Reportes y estadísticas avanzadas' },
];

// Dos planes de ejemplo para poder probar la jerarquía de principio a fin
// apenas se instala la plataforma. Nombres, precios y límites son
// editables desde SUPER ADMIN en cualquier momento (punto 84 del pedido) —
// esto es solo el punto de partida.
const PLANS: {
  name: string;
  price: number;
  billingPeriod: 'monthly' | 'yearly';
  maxUsers: number;
  maxProfessionals: number;
  maxBranches: number;
  maxClients: number;
  featureKeys: string[];
}[] = [
  {
    name: 'Básico',
    price: 9999,
    billingPeriod: 'monthly',
    maxUsers: 3,
    maxProfessionals: 2,
    maxBranches: 1,
    maxClients: 200,
    featureKeys: ['waitlist'],
  },
  {
    name: 'Premium',
    price: 29999,
    billingPeriod: 'monthly',
    maxUsers: 20,
    maxProfessionals: 15,
    maxBranches: 5,
    maxClients: 5000,
    featureKeys: FEATURE_FLAGS.map((f) => f.key), // todos
  },
];

const SYSTEM_ROLES: { name: string; permissionKeys: string[] }[] = [
  {
    name: 'Administrador del negocio',
    permissionKeys: PERMISSIONS.map((p) => p.key), // todos
  },
  {
    name: 'Recepcionista',
    permissionKeys: [
      'usuarios.ver',
      'clientes.ver',
      'clientes.crear',
      'clientes.editar',
      'profesionales.ver',
      'servicios.ver',
      'turnos.ver',
      'turnos.crear',
      'turnos.editar',
      'turnos.cancelar',
      'ventas.ver',
      'ventas.crear',
      'caja.ver',
      'soporte.ver',
      'soporte.crear',
    ],
  },
  {
    name: 'Profesional',
    permissionKeys: ['turnos.ver', 'turnos.editar', 'clientes.ver', 'profesionales.ver', 'servicios.ver'],
  },
];

async function upsertSystemRole(name: string, permissionIds: string[]) {
  const existing = await prisma.role.findFirst({ where: { tenantId: null, name } });
  if (existing) {
    await prisma.rolePermission.deleteMany({ where: { roleId: existing.id } });
    await prisma.rolePermission.createMany({
      data: permissionIds.map((permissionId) => ({ roleId: existing.id, permissionId })),
    });
    return existing;
  }
  return prisma.role.create({
    data: {
      name,
      isSystem: true,
      tenantId: null,
      permissions: { create: permissionIds.map((permissionId) => ({ permissionId })) },
    },
  });
}

async function main() {
  for (const perm of PERMISSIONS) {
    await prisma.permission.upsert({ where: { key: perm.key }, update: {}, create: perm });
  }

  const allPermissions = await prisma.permission.findMany();
  const idsForKeys = (keys: string[]) =>
    allPermissions.filter((p) => keys.includes(p.key)).map((p) => p.id);

  for (const role of SYSTEM_ROLES) {
    await upsertSystemRole(role.name, idsForKeys(role.permissionKeys));
  }

  for (const flag of FEATURE_FLAGS) {
    await prisma.featureFlag.upsert({
      where: { key: flag.key },
      update: {},
      create: { ...flag, globallyEnabled: true },
    });
  }
  const allFlags = await prisma.featureFlag.findMany();
  const flagIdsForKeys = (keys: string[]) =>
    allFlags.filter((f) => keys.includes(f.key)).map((f) => f.id);

  for (const planDef of PLANS) {
    const { featureKeys, ...planData } = planDef;
    const existingPlan = await prisma.plan.findFirst({ where: { name: planDef.name } });
    const plan = existingPlan
      ? await prisma.plan.update({ where: { id: existingPlan.id }, data: planData })
      : await prisma.plan.create({ data: planData });

    await prisma.planFeature.deleteMany({ where: { planId: plan.id } });
    await prisma.planFeature.createMany({
      data: flagIdsForKeys(featureKeys).map((featureFlagId) => ({ planId: plan.id, featureFlagId })),
    });
  }

  // Bootstrap del primer SUPER ADMIN. No hay endpoint público de alta de
  // PlatformAdmin (sería un agujero de seguridad — punto 8 del pedido): la
  // única forma de crear el primero es este seed, leyendo credenciales de
  // variables de entorno. mfaEnabled queda en false a propósito: el primer
  // login exige completar el enrolamiento de MFA (ver
  // platform-admin-auth.service.ts) antes de poder hacer nada.
  const bootstrapEmail = process.env.SUPER_ADMIN_BOOTSTRAP_EMAIL;
  const bootstrapPassword = process.env.SUPER_ADMIN_BOOTSTRAP_PASSWORD;
  if (bootstrapEmail && bootstrapPassword) {
    const existingAdmin = await prisma.platformAdmin.findUnique({ where: { email: bootstrapEmail } });
    if (!existingAdmin) {
      const passwordHash = await argon2.hash(bootstrapPassword);
      await prisma.platformAdmin.create({ data: { email: bootstrapEmail, passwordHash } });
      console.log(`SUPER ADMIN creado: ${bootstrapEmail} (falta completar enrolamiento de MFA en el primer login)`);
    } else {
      console.log(`SUPER ADMIN ${bootstrapEmail} ya existía, no se modificó.`);
    }
  } else {
    console.log(
      'SUPER_ADMIN_BOOTSTRAP_EMAIL / SUPER_ADMIN_BOOTSTRAP_PASSWORD no están seteadas: no se creó ningún PlatformAdmin.',
    );
  }

  console.log(
    `Seed OK: ${allPermissions.length} permisos, ${SYSTEM_ROLES.length} roles de sistema, ` +
      `${allFlags.length} feature flags, ${PLANS.length} planes.`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
