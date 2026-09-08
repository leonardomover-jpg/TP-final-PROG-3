import { SetMetadata } from '@nestjs/common';
import { LimitableResource } from '../plan-limits.types';

export const LIMIT_RESOURCE_KEY = 'limitResource';

// Uso: @LimitResource('users') en un endpoint de creación. Evaluado por
// PlanLimitsGuard antes de que el handler corra.
export const LimitResource = (resource: LimitableResource) => SetMetadata(LIMIT_RESOURCE_KEY, resource);
