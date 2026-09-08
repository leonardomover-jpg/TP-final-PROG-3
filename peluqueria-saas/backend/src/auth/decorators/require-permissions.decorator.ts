import { SetMetadata } from '@nestjs/common';

export const PERMISSIONS_KEY = 'permissions';

// Uso: @RequirePermissions('clientes.crear'). Evaluado por PermissionsGuard
// contra los permisos reales del usuario en el momento del request (nunca
// contra algo cacheado en el JWT) — doc 04-SEGURIDAD-BASELINE §2.
export const RequirePermissions = (...permissions: string[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);
