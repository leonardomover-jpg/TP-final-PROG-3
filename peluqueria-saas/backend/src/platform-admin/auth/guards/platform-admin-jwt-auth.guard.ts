import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

// Guard LOCAL (no registrado globalmente): se aplica explícitamente con
// @UseGuards(PlatformAdminJwtAuthGuard) en cada controller del panel de
// SUPER ADMIN. Las rutas de negocio nunca pasan por acá, y las rutas de
// SUPER ADMIN se marcan @Public() respecto del JwtAuthGuard de negocio
// (ver platform-admin-*.controller.ts) — los dos paneles no comparten
// ningún guard ni ningún secreto.
@Injectable()
export class PlatformAdminJwtAuthGuard extends AuthGuard('platform-admin-jwt') {}
