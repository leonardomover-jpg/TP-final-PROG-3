-- DropForeignKey
ALTER TABLE "TenantHolidayOverride" DROP CONSTRAINT "TenantHolidayOverride_holidayId_fkey";

-- AddForeignKey
ALTER TABLE "TenantHolidayOverride" ADD CONSTRAINT "TenantHolidayOverride_holidayId_fkey" FOREIGN KEY ("holidayId") REFERENCES "Holiday"("id") ON DELETE CASCADE ON UPDATE CASCADE;
