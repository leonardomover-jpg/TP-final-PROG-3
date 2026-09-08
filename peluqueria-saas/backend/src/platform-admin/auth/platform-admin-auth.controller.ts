import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { PlatformAdminAuthService } from './platform-admin-auth.service';
import { PlatformAdminLoginDto } from './dto/login.dto';
import { VerifyMfaDto } from './dto/verify-mfa.dto';
import { PlatformAdminRefreshDto } from './dto/refresh.dto';
import { Public } from '../../auth/decorators/public.decorator';

// Todas las rutas acá son @Public() respecto del JwtAuthGuard GLOBAL de
// negocio (que exige un token de tenant) — este controller no usa ese
// mecanismo en absoluto, tiene el suyo propio (PlatformAdminJwtAuthGuard,
// aplicado en los demás controllers de platform-admin/*).
@Controller('platform-admin/auth')
export class PlatformAdminAuthController {
  constructor(private readonly authService: PlatformAdminAuthService) {}

  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @Post('login')
  login(@Body() dto: PlatformAdminLoginDto) {
    return this.authService.login(dto);
  }

  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @Post('mfa/verify')
  verifyMfa(@Body() dto: VerifyMfaDto) {
    return this.authService.verifyMfa(dto.mfaChallengeToken, dto.code);
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('refresh')
  refresh(@Body() dto: PlatformAdminRefreshDto) {
    return this.authService.refresh(dto.refreshToken);
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('logout')
  async logout(@Body() dto: PlatformAdminRefreshDto) {
    await this.authService.logout(dto.refreshToken);
    return { success: true };
  }
}
