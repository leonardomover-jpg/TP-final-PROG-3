// Recursos limitables por plan (doc 05-OBSERVACIONES-Y-RIESGOS §2).
export type LimitableResource = 'users' | 'branches' | 'clients' | 'professionals';

export interface PlanLimitUsage {
  resource: LimitableResource;
  current: number;
  max: number | null; // null = el negocio no tiene plan asignado, sin límite conocido
}
