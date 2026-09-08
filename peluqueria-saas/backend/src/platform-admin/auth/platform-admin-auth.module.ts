import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { PlatformAdminAuthService } from './platform-admin-auth.service';
import { PlatformAdminAuthController } from './platform-admin-auth.controller';
import { PlatformAdminJwtStrategy } from './strategies/platform-admin-jwt.strategy';

@Module({
  imports: [PassportModule, JwtModule.register({})],
  providers: [PlatformAdminAuthService, PlatformAdminJwtStrategy],
  controllers: [PlatformAdminAuthController],
  exports: [PlatformAdminAuthService],
})
export class PlatformAdminAuthModule {}
