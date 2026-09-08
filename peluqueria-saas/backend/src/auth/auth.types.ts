// Payload embebido en el access token. Nunca contiene datos sensibles ni
// permisos (los permisos se resuelven fresco en cada request via
// PermissionsGuard, para que un cambio de rol tenga efecto inmediato sin
// esperar a que expire un token viejo — ver doc 04-SEGURIDAD-BASELINE §2).
export interface JwtPayload {
  sub: string; // userId
  tenantId: string;
  email: string;
}

export interface AuthenticatedUser {
  userId: string;
  tenantId: string;
  email: string;
}
