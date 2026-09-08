import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthenticatedUser, JwtPayload } from '../auth.types';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(private readonly prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_ACCESS_SECRET as string,
    });
  }

  // Corre en cada request autenticado. Se vuelve a chequear contra la base
  // (no se confía ciegamente en el payload firmado) para que suspender o
  // borrar un usuario corte el acceso sin esperar a que expire el access
  // token — doc 04-SEGURIDAD-BASELINE §1. También se revalida el tenant: si
  // SUPER ADMIN suspende/cancela el negocio (Etapa 3), ningún usuario de ese
  // tenant sigue teniendo acceso con un token ya emitido.
  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: { tenant: true },
    });
    if (
      !user ||
      user.deletedAt ||
      user.status !== 'active' ||
      user.tenantId !== payload.tenantId ||
      user.tenant.status !== 'active'
    ) {
      throw new UnauthorizedException('Sesión inválida.');
    }
    return { userId: user.id, tenantId: user.tenantId, email: user.email };
  }
}
