import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './strategies/jwt.strategy';

@Module({
  // Sin secret/expiresIn por defecto acá a propósito: AuthService firma
  // access y refresh tokens con secretos y duraciones distintas en cada
  // llamada (ver issueTokens en auth.service.ts).
  imports: [PassportModule, JwtModule.register({})],
  providers: [AuthService, JwtStrategy],
  controllers: [AuthController],
  exports: [AuthService],
})
export class AuthModule {}
