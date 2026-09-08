import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { createHash, randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterTenantDto } from './dto/register-tenant.dto';
import { LoginDto } from './dto/login.dto';
import { JwtPayload } from './auth.types';

const ACCESS_TOKEN_TTL = '15m';
const REFRESH_TOKEN_TTL = '7d';
const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// Los refresh tokens no se guardan en texto plano en la base: se guarda el
// hash de su jti (id de token), así un dump de la tabla no sirve para
// reconstruir un token usable — doc 04-SEGURIDAD-BASELINE §1/§5.
function hashOpaqueToken(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  private async issueTokens(user: { id: string; tenantId: string; email: string }) {
    const payload: JwtPayload = { sub: user.id, tenantId: user.tenantId, email: user.email };

    const accessToken = this.jwt.sign(payload, {
      secret: process.env.JWT_ACCESS_SECRET,
      expiresIn: ACCESS_TOKEN_TTL,
    });

    const jti = randomUUID();
    const refreshToken = this.jwt.sign(
      { ...payload, jti },
      { secret: process.env.JWT_REFRESH_SECRET, expiresIn: REFRESH_TOKEN_TTL },
    );

    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: hashOpaqueToken(jti),
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
      },
    });

    return { accessToken, refreshToken };
  }

  async registerTenant(dto: RegisterTenantDto) {
    const existingSlug = await this.prisma.tenant.findUnique({ where: { slug: dto.slug } });
    if (existingSlug) {
      throw new ConflictException('Ese identificador de negocio ya está en uso.');
    }

    const adminRole = await this.prisma.role.findFirst({
      where: { isSystem: true, name: 'Administrador del negocio' },
    });
    if (!adminRole) {
      // No debería pasar en un ambiente correctamente inicializado: falta
      // correr `npm run prisma:seed` (roles/permisos de sistema).
      throw new ConflictException(
        'La plataforma todavía no tiene los roles de sistema inicializados.',
      );
    }

    const passwordHash = await argon2.hash(dto.password);

    const { tenant, user } = await this.prisma.$transaction(async (tx) => {
      const createdTenant = await tx.tenant.create({
        data: { name: dto.businessName, slug: dto.slug },
      });
      const mainBranch = await tx.branch.create({
        data: { tenantId: createdTenant.id, name: 'Casa Central', isMain: true },
      });
      const createdUser = await tx.user.create({
        data: {
          tenantId: createdTenant.id,
          firstName: dto.firstName,
          lastName: dto.lastName,
          email: dto.email,
          passwordHash,
          branches: { create: [{ branchId: mainBranch.id }] },
          roles: { create: [{ roleId: adminRole.id }] },
        },
      });
      await tx.auditLog.create({
        data: {
          tenantId: createdTenant.id,
          actorType: 'user',
          actorId: createdUser.id,
          action: 'tenant.registered',
          entityType: 'Tenant',
          entityId: createdTenant.id,
        },
      });
      return { tenant: createdTenant, user: createdUser };
    });

    const tokens = await this.issueTokens(user);
    return { tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug }, ...tokens };
  }

  async login(dto: LoginDto) {
    const tenant = await this.prisma.tenant.findUnique({ where: { slug: dto.tenantSlug } });
    if (!tenant || tenant.status !== 'active') {
      throw new UnauthorizedException('Credenciales inválidas.');
    }

    const user = await this.prisma.user.findUnique({
      where: { tenantId_email: { tenantId: tenant.id, email: dto.email } },
    });
    if (!user || user.deletedAt || user.status !== 'active') {
      throw new UnauthorizedException('Credenciales inválidas.');
    }

    const validPassword = await argon2.verify(user.passwordHash, dto.password);
    if (!validPassword) {
      throw new UnauthorizedException('Credenciales inválidas.');
    }

    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    await this.prisma.auditLog.create({
      data: { tenantId: tenant.id, actorType: 'user', actorId: user.id, action: 'user.login' },
    });

    return this.issueTokens(user);
  }

  async refresh(refreshToken: string) {
    let payload: JwtPayload & { jti: string };
    try {
      payload = this.jwt.verify(refreshToken, { secret: process.env.JWT_REFRESH_SECRET });
    } catch {
      throw new UnauthorizedException('Refresh token inválido o vencido.');
    }

    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: hashOpaqueToken(payload.jti) },
    });
    const isValidStoredToken =
      stored && !stored.revokedAt && stored.expiresAt > new Date() && stored.userId === payload.sub;
    if (!isValidStoredToken) {
      throw new UnauthorizedException('Refresh token inválido o vencido.');
    }

    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || user.deletedAt || user.status !== 'active') {
      throw new UnauthorizedException('Refresh token inválido o vencido.');
    }

    // Rotación: se revoca el token usado y se emite un par nuevo. Reutilizar
    // un refresh token ya rotado (ej. robado y usado en paralelo) queda
    // bloqueado en el próximo intento porque ya está revoked.
    await this.prisma.refreshToken.update({
      where: { id: stored!.id },
      data: { revokedAt: new Date() },
    });

    return this.issueTokens(user);
  }

  async logout(refreshToken: string) {
    try {
      const payload = this.jwt.verify<JwtPayload & { jti: string }>(refreshToken, {
        secret: process.env.JWT_REFRESH_SECRET,
      });
      await this.prisma.refreshToken.updateMany({
        where: { tokenHash: hashOpaqueToken(payload.jti), revokedAt: null },
        data: { revokedAt: new Date() },
      });
    } catch {
      // Token ya inválido/vencido: nada que revocar, no-op silencioso.
    }
  }
}
