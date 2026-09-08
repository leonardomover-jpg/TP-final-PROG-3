import { IsBoolean } from 'class-validator';

export class UpdateTenantFlagDto {
  @IsBoolean()
  enabled: boolean;
}
