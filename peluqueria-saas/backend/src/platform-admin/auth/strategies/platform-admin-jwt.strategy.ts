import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../../prisma/prisma.service';
import { AuthenticatedPlatformAdmin, PlatformAdminJwtPayload } from '../platform-admin-auth.types';

// Estrategia passport separada ('platform-admin-jwt', no 'jwt') con su
// propio secreto (PLATFORM_ADMIN_JWT_ACCESS_SECRET) — un token de negocio
// nunca puede validar acá, y viceversa.
@Injectable()
export class PlatformAdminJwtStrategy extends PassportStrategy(Strategy, 'platform-admin-jwt') {
  constructor(private readonly prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.PLATFORM_ADMIN_JWT_ACCESS_SECRET as string,
    });
  }

  async validate(payload: PlatformAdminJwtPayload): Promise<AuthenticatedPlatformAdmin> {
    // Un token con purpose "mfa_challenge" (emitido entre el paso 1 y 2 del
    // login) nunca es válido como bearer de acceso real, aunque esté
    // correctamente firmado — evita que una fuga de ese token intermedio
    // sirva para algo sin pasar el segundo factor.
    if (payload.purpose !== 'access') {
      throw new UnauthorizedException('Sesión inválida.');
    }

    const admin = await this.prisma.platformAdmin.findUnique({ where: { id: payload.sub } });
    if (!admin || admin.status !== 'active') {
      throw new UnauthorizedException('Sesión inválida.');
    }
    return { platformAdminId: admin.id, email: admin.email };
  }
}
