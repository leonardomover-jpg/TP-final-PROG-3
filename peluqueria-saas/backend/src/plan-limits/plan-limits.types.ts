// Recursos limitables por plan (doc 05-OBSERVACIONES-Y-RIESGOS §2). Solo se
// cuentan acá los que ya tienen tabla propia — 'professionals' y 'clients'
// se agregan cuando existan esos módulos (Etapa 6/7), sin tocar nada de
// esto: el switch de PlanLimitsService.countCurrentUsage ya está preparado
// para sumar un case más.
export type LimitableResource = 'users' | 'branches';

export interface PlanLimitUsage {
  resource: LimitableResource;
  current: number;
  max: number | null; // null = el negocio no tiene plan asignado, sin límite conocido
}
