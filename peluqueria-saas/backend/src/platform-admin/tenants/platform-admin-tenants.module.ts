import { Module } from '@nestjs/common';
import { PlatformAdminTenantsController } from './platform-admin-tenants.controller';
import { PlatformAdminTenantsService } from './platform-admin-tenants.service';

// Nota: no se vuelve a declarar PlatformAdminJwtStrategy acá — la
// estrategia passport se instancia una sola vez, en PlatformAdminAuthModule
// (importado por AppModule). PlatformAdminJwtAuthGuard('platform-admin-jwt')
// la encuentra por nombre sin necesidad de que cada módulo la re-declare.
@Module({
  controllers: [PlatformAdminTenantsController],
  providers: [PlatformAdminTenantsService],
})
export class PlatformAdminTenantsModule {}
