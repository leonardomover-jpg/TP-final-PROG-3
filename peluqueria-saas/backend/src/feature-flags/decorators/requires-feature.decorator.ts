import { SetMetadata } from '@nestjs/common';

export const REQUIRES_FEATURE_KEY = 'requiresFeature';

// Uso: @RequiresFeature('points') en un endpoint de un módulo opcional
// (Puntos, Gift Cards, WhatsApp, etc. — Capa 3/4 del doc 01). Evaluado por
// FeatureFlagGuard contra FeatureFlagsService.isEnabledForTenant en cada
// request, nunca cacheado.
export const RequiresFeature = (key: string) => SetMetadata(REQUIRES_FEATURE_KEY, key);
