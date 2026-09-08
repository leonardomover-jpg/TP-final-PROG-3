import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { authenticator } from 'otplib';
import { createHash, randomUUID } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { PlatformAdminLoginDto } from './dto/login.dto';
import { PlatformAdminJwtPayload } from './platform-admin-auth.types';

const ACCESS_TOKEN_TTL = '15m';
const REFRESH_TOKEN_TTL = '7d';
const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MFA_CHALLENGE_TTL = '5m';
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000;
const OTP_ISSUER = 'PromptMaestro SUPER ADMIN';

function hashOpaqueToken(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

// Todo login de SUPER ADMIN exige MFA (punto 8 del pedido: "MFA/2FA
// obligatorio"). El flujo es siempre en dos pasos, nunca hay un camino que
// devuelva un access token real sin haber pasado un código TOTP válido:
//
//   1) POST /login (email+password)
//        -> si mfaEnabled=false: primer login, se genera el secreto TOTP y
//           se devuelve para que el admin lo cargue en su app (Google
//           Authenticator, etc.) junto con un mfaChallengeToken.
//        -> si mfaEnabled=true: se devuelve solo un mfaChallengeToken.
//      En ningún caso el paso 1 devuelve accessToken/refreshToken.
//   2) POST /mfa/verify (mfaChallengeToken + code de 6 dígitos)
//        -> si es la primera vez, confirma el enrolamiento (mfaEnabled=true)
//        -> siempre devuelve accessToken/refreshToken recién ahí.
@Injectable()
export class PlatformAdminAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  private issueMfaChallengeToken(admin: { id: string; email: string }): string {
    const payload: PlatformAdminJwtPayload = {
      sub: admin.id,
      email: admin.email,
      purpose: 'mfa_challenge',
    };
    return this.jwt.sign(payload, {
      secret: process.env.PLATFORM_ADMIN_JWT_ACCESS_SECRET,
      expiresIn: MFA_CHALLENGE_TTL,
    });
  }

  private async issueSessionTokens(admin: { id: string; email: string }) {
    const payload: PlatformAdminJwtPayload = { sub: admin.id, email: admin.email, purpose: 'access' };
    const accessToken = this.jwt.sign(payload, {
      secret: process.env.PLATFORM_ADMIN_JWT_ACCESS_SECRET,
      expiresIn: ACCESS_TOKEN_TTL,
    });

    const jti = randomUUID();
    const refreshToken = this.jwt.sign(
      { ...payload, jti },
      { secret: process.env.PLATFORM_ADMIN_JWT_REFRESH_SECRET, expiresIn: REFRESH_TOKEN_TTL },
    );
    await this.prisma.platformRefreshToken.create({
      data: {
        platformAdminId: admin.id,
        tokenHash: hashOpaqueToken(jti),
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
      },
    });

    return { accessToken, refreshToken };
  }

  private async registerFailedAttempt(adminId: string, currentAttempts: number) {
    const attempts = currentAttempts + 1;
    const shouldLock = attempts >= MAX_FAILED_ATTEMPTS;
    await this.prisma.platformAdmin.update({
      where: { id: adminId },
      data: {
        failedLoginAttempts: shouldLock ? 0 : attempts,
        lockedUntil: shouldLock ? new Date(Date.now() + LOCKOUT_DURATION_MS) : undefined,
      },
    });
  }

  async login(dto: PlatformAdminLoginDto) {
    const admin = await this.prisma.platformAdmin.findUnique({ where: { email: dto.email } });
    // Mensaje idéntico exista o no la cuenta (no filtrar qué emails son SUPER ADMIN).
    const genericError = new UnauthorizedException('Credenciales inválidas.');
    if (!admin || admin.status !== 'active') {
      throw genericError;
    }
    if (admin.lockedUntil && admin.lockedUntil > new Date()) {
      throw new ForbiddenException(
        'Cuenta bloqueada temporalmente por intentos fallidos. Probá de nuevo más tarde.',
      );
    }

    const validPassword = await argon2.verify(admin.passwordHash, dto.password);
    if (!validPassword) {
      await this.registerFailedAttempt(admin.id, admin.failedLoginAttempts);
      throw genericError;
    }

    const mfaChallengeToken = this.issueMfaChallengeToken(admin);

    if (!admin.mfaEnabled) {
      // Primer login: se genera (pero no se confirma) el secreto TOTP.
      const secret = authenticator.generateSecret();
      await this.prisma.platformAdmin.update({
        where: { id: admin.id },
        data: { mfaSecret: secret },
      });
      const otpauthUrl = authenticator.keyuri(admin.email, OTP_ISSUER, secret);
      return { mfaSetupRequired: true, mfaChallengeToken, otpauthUrl, secret };
    }

    return { mfaRequired: true, mfaChallengeToken };
  }

  async verifyMfa(mfaChallengeToken: string, code: string) {
    let payload: PlatformAdminJwtPayload;
    try {
      payload = this.jwt.verify(mfaChallengeToken, {
        secret: process.env.PLATFORM_ADMIN_JWT_ACCESS_SECRET,
      });
    } catch {
      throw new UnauthorizedException('El desafío de MFA es inválido o venció. Iniciá sesión de nuevo.');
    }
    if (payload.purpose !== 'mfa_challenge') {
      throw new UnauthorizedException('Token inválido.');
    }

    const admin = await this.prisma.platformAdmin.findUnique({ where: { id: payload.sub } });
    if (!admin || admin.status !== 'active' || !admin.mfaSecret) {
      throw new UnauthorizedException('Sesión inválida.');
    }
    if (admin.lockedUntil && admin.lockedUntil > new Date()) {
      throw new ForbiddenException(
        'Cuenta bloqueada temporalmente por intentos fallidos. Probá de nuevo más tarde.',
      );
    }

    const validCode = authenticator.verify({ token: code, secret: admin.mfaSecret });
    if (!validCode) {
      await this.registerFailedAttempt(admin.id, admin.failedLoginAttempts);
      throw new UnauthorizedException('Código incorrecto.');
    }

    await this.prisma.platformAdmin.update({
      where: { id: admin.id },
      data: { mfaEnabled: true, failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: new Date() },
    });
    await this.prisma.auditLog.create({
      data: { tenantId: null, actorType: 'platform_admin', actorId: admin.id, action: 'platform_admin.login' },
    });

    return this.issueSessionTokens(admin);
  }

  async refresh(refreshToken: string) {
    let payload: PlatformAdminJwtPayload & { jti: string };
    try {
      payload = this.jwt.verify(refreshToken, { secret: process.env.PLATFORM_ADMIN_JWT_REFRESH_SECRET });
    } catch {
      throw new UnauthorizedException('Refresh token inválido o vencido.');
    }

    const stored = await this.prisma.platformRefreshToken.findUnique({
      where: { tokenHash: hashOpaqueToken(payload.jti) },
    });
    const isValid =
      stored && !stored.revokedAt && stored.expiresAt > new Date() && stored.platformAdminId === payload.sub;
    if (!isValid) {
      throw new UnauthorizedException('Refresh token inválido o vencido.');
    }

    const admin = await this.prisma.platformAdmin.findUnique({ where: { id: payload.sub } });
    if (!admin || admin.status !== 'active') {
      throw new UnauthorizedException('Refresh token inválido o vencido.');
    }

    await this.prisma.platformRefreshToken.update({
      where: { id: stored!.id },
      data: { revokedAt: new Date() },
    });

    return this.issueSessionTokens(admin);
  }

  async logout(refreshToken: string) {
    try {
      const payload = this.jwt.verify<PlatformAdminJwtPayload & { jti: string }>(refreshToken, {
        secret: process.env.PLATFORM_ADMIN_JWT_REFRESH_SECRET,
      });
      await this.prisma.platformRefreshToken.updateMany({
        where: { tokenHash: hashOpaqueToken(payload.jti), revokedAt: null },
        data: { revokedAt: new Date() },
      });
    } catch {
      // no-op: token ya inválido/vencido.
    }
  }
}
