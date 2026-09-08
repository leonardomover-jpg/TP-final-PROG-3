// Tokens de SUPER ADMIN usan secretos y un "purpose" completamente
// distintos de los de un negocio (auth/auth.types.ts) — nunca se procesan
// con la misma estrategia passport ni el mismo guard, para que sea
// estructuralmente imposible que un JWT de un panel sirva en el otro
// (punto 7 del pedido: "no debe compartir el mismo panel").

export interface PlatformAdminJwtPayload {
  sub: string; // platformAdminId
  email: string;
  purpose: 'access' | 'mfa_challenge';
}

export interface AuthenticatedPlatformAdmin {
  platformAdminId: string;
  email: string;
}
