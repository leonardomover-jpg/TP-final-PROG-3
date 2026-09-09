-- Etapa 23 (Seguridad hardening) — capa 2 de aislamiento multi-tenant
-- (doc `02-MULTI-TENANCY-Y-BASE-DE-DATOS.md` §3, doc
-- `27-SEGURIDAD-HARDENING.md`): Row-Level Security de Postgres como
-- defensa ADICIONAL al filtro de tenant ya aplicado en la capa de
-- aplicación (tenant-scope.extension.ts, capa 1, la que realmente
-- protege hoy).
--
-- Deliberadamente se usa ENABLE (no FORCE) ROW LEVEL SECURITY: esta app
-- conecta a Postgres con un único rol, dueño de las tablas — Postgres
-- exime al dueño de las políticas RLS salvo que se use FORCE. Forzarlo
-- rompería sin arreglo posible los muchos lugares que hoy usan
-- PrismaService crudo intencionalmente (NotificationsService,
-- PlanLimitsService, FeatureFlagsService, los webhooks, todo
-- platform-admin/*) sin setear la sesión de tenant — verificado en la
-- práctica antes de escribir esta migración. Activar la capa 2 de
-- verdad requiere un rol de Postgres separado, de menor privilegio, sin
-- BYPASSRLS, dedicado a las queries tenant-scoped — no forma parte de
-- esta etapa (ver docs `27-SEGURIDAD-HARDENING.md` §3 "qué no se hizo").
--
-- Esta migración deja el esquema listo (políticas correctas ya escritas)
-- para que, el día que exista ese rol restringido, activarlas sea
-- ALTER TABLE ... FORCE ROW LEVEL SECURITY en cada tabla — sin tocar una
-- sola línea de política.

ALTER TABLE "Branch" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Branch" USING ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "User" USING ("tenantId" = current_setting('app.tenant_id', true));

-- Role: tenantId nullable a propósito (null = rol de sistema, compartido
-- y de solo lectura entre todos los tenants) — la política deja pasar
-- también esas filas, mismo criterio que tenant-scope.extension.ts.
ALTER TABLE "Role" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Role" USING ("tenantId" = current_setting('app.tenant_id', true) OR "tenantId" IS NULL);

ALTER TABLE "TenantFeatureFlag" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "TenantFeatureFlag" USING ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "Subscription" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Subscription" USING ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "Client" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Client" USING ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "Professional" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Professional" USING ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "Service" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Service" USING ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "ScheduleException" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "ScheduleException" USING ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "TenantHolidayOverride" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "TenantHolidayOverride" USING ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "Appointment" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Appointment" USING ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "WaitlistEntry" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "WaitlistEntry" USING ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "Product" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Product" USING ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "Supplier" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Supplier" USING ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "Purchase" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Purchase" USING ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "CashRegister" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "CashRegister" USING ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "Sale" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Sale" USING ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "Expense" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Expense" USING ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "LoyaltyPointsTransaction" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "LoyaltyPointsTransaction" USING ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "GiftCard" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "GiftCard" USING ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "Referral" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Referral" USING ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "Promotion" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Promotion" USING ("tenantId" = current_setting('app.tenant_id', true));

-- AuditLog: tenantId nullable (null = acción de SUPER ADMIN sobre la
-- plataforma) — a propósito SIN el "OR tenantId IS NULL" que sí tiene
-- Role: esas filas son de la plataforma, ningún tenant debe poder verlas
-- nunca, ni siquiera con un futuro rol restringido.
ALTER TABLE "AuditLog" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "AuditLog" USING ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "SupportTicket" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "SupportTicket" USING ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "CommunicationTenant" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "CommunicationTenant" USING ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "Notification" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Notification" USING ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "TenantIntegration" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "TenantIntegration" USING ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "Deposit" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Deposit" USING ("tenantId" = current_setting('app.tenant_id', true));
