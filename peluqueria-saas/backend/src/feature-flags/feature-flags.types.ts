// Resultado de resolver la jerarquía SUPER ADMIN → Plan → Negocio para un
// flag puntual (doc 03-PLANES-FEATURE-FLAGS-SUSCRIPCIONES §3). `available`
// dice si el negocio PODRÍA llegar a usarlo; `enabled` dice si lo tiene
// prendido en este momento. `reason` solo se completa cuando available es
// false, para poder mostrarlo tal cual en el frontend (punto 12 del
// pedido: "mostrar claramente el motivo").
export interface FeatureFlagResolution {
  key: string;
  name: string;
  description: string;
  available: boolean;
  enabled: boolean;
  reason?: string;
}
