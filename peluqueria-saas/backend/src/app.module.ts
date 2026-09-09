import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { RolesModule } from './roles/roles.module';
import { PermissionsModule } from './permissions/permissions.module';
import { BranchesModule } from './branches/branches.module';
import { ClientsModule } from './clients/clients.module';
import { ProfessionalsModule } from './professionals/professionals.module';
import { ServicesModule } from './services/services.module';
import { ScheduleModule } from './schedule/schedule.module';
import { AppointmentsModule } from './appointments/appointments.module';
import { WaitlistModule } from './waitlist/waitlist.module';
import { ProductsModule } from './products/products.module';
import { SuppliersModule } from './suppliers/suppliers.module';
import { PurchasesModule } from './purchases/purchases.module';
import { CashRegisterModule } from './cash-register/cash-register.module';
import { SalesModule } from './sales/sales.module';
import { ExpensesModule } from './expenses/expenses.module';
import { PointsModule } from './points/points.module';
import { GiftCardsModule } from './gift-cards/gift-cards.module';
import { ReferralsModule } from './referrals/referrals.module';
import { PromotionsModule } from './promotions/promotions.module';
import { NotificationsModule } from './notifications/notifications.module';
import { IntegrationsModule } from './integrations/integrations.module';
import { DepositsModule } from './deposits/deposits.module';
import { MercadoPagoTenantWebhookModule } from './webhooks/mercado-pago-tenant/mercado-pago-tenant-webhook.module';
import { WhatsAppTenantWebhookModule } from './webhooks/whatsapp-tenant/whatsapp-tenant-webhook.module';
import { MetaMessagingModule } from './meta-messaging/meta-messaging.module';
import { MetaTenantWebhookModule } from './webhooks/meta-tenant/meta-tenant-webhook.module';
import { PublicBookingModule } from './public-booking/public-booking.module';
import { ReportsModule } from './reports/reports.module';
import { AiModule } from './ai/ai.module';
import { AuditModule } from './audit/audit.module';
import { HealthModule } from './health/health.module';
import { PlatformAdminAuthModule } from './platform-admin/auth/platform-admin-auth.module';
import { PlatformAdminTenantsModule } from './platform-admin/tenants/platform-admin-tenants.module';
import { PlatformAdminAuditModule } from './platform-admin/audit/platform-admin-audit.module';
import { PlatformAdminSupportModule } from './platform-admin/support/platform-admin-support.module';
import { PlatformAdminCommunicationsModule } from './platform-admin/communications/platform-admin-communications.module';
import { PlatformAdminPlansModule } from './platform-admin/plans/platform-admin-plans.module';
import { PlatformAdminFeatureFlagsModule } from './platform-admin/feature-flags/platform-admin-feature-flags.module';
import { PlatformAdminHolidaysModule } from './platform-admin/holidays/platform-admin-holidays.module';
import { SupportModule } from './support/support.module';
import { FeatureFlagsModule } from './feature-flags/feature-flags.module';
import { PlanLimitsModule } from './plan-limits/plan-limits.module';
import { PlanInfoModule } from './plan-info/plan-info.module';
import { SubscriptionsModule } from './subscriptions/subscriptions.module';
import { MercadoPagoWebhookModule } from './webhooks/mercado-pago/mercado-pago-webhook.module';
import { PlatformAdminSubscriptionsModule } from './platform-admin/subscriptions/platform-admin-subscriptions.module';
import { PlatformAdminBackupsModule } from './platform-admin/backups/platform-admin-backups.module';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { PermissionsGuard } from './auth/guards/permissions.guard';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // Rate limiting global (punto 62 del pedido: brute force / rate
    // limiting). Los endpoints de login aplican un límite más estricto vía
    // @Throttle puntual — ver auth.controller.ts y platform-admin-auth.controller.ts.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 60 }]),
    PrismaModule,
    AuthModule,
    UsersModule,
    RolesModule,
    PermissionsModule,
    BranchesModule,
    ClientsModule,
    ProfessionalsModule,
    ServicesModule,
    ScheduleModule,
    AppointmentsModule,
    WaitlistModule,
    ProductsModule,
    SuppliersModule,
    PurchasesModule,
    CashRegisterModule,
    SalesModule,
    ExpensesModule,
    PointsModule,
    GiftCardsModule,
    ReferralsModule,
    PromotionsModule,
    NotificationsModule,
    IntegrationsModule,
    DepositsModule,
    MercadoPagoTenantWebhookModule,
    WhatsAppTenantWebhookModule,
    MetaMessagingModule,
    MetaTenantWebhookModule,
    PublicBookingModule,
    ReportsModule,
    AiModule,
    AuditModule,
    HealthModule,
    SupportModule,
    FeatureFlagsModule,
    PlanLimitsModule,
    PlanInfoModule,
    SubscriptionsModule,
    MercadoPagoWebhookModule,
    PlatformAdminAuthModule,
    PlatformAdminTenantsModule,
    PlatformAdminAuditModule,
    PlatformAdminSupportModule,
    PlatformAdminCommunicationsModule,
    PlatformAdminPlansModule,
    PlatformAdminFeatureFlagsModule,
    PlatformAdminHolidaysModule,
    PlatformAdminSubscriptionsModule,
    PlatformAdminBackupsModule,
  ],
  providers: [
    // Orden importa: primero rate limiting, después autenticación (JWT),
    // después autorización (permisos) — doc 04-SEGURIDAD-BASELINE §1/§2.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
})
export class AppModule {}
