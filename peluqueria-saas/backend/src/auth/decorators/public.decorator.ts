import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

// Marca un endpoint como accesible sin JWT. El sistema es "seguro por
// defecto": JwtAuthGuard corre globalmente y exige token salvo que el
// handler lleve este decorador explícitamente (doc 04-SEGURIDAD-BASELINE §2).
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
