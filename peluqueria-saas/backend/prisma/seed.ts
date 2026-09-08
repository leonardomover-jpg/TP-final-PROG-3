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
    permissionKeys: ['turnos.ver', 'turnos.editar', 'clientes.ver'],
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

  console.log(`Seed OK: ${allPermissions.length} permisos, ${SYSTEM_ROLES.length} roles de sistema.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
