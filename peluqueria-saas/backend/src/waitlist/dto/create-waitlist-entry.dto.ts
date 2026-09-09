import { IsISO8601, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateWaitlistEntryDto {
  @IsOptional()
  @IsString()
  branchId?: string;

  @IsOptional()
  @IsString()
  professionalId?: string;

  @IsString()
  clientId: string;

  @IsString()
  serviceId: string;

  @IsOptional()
  @IsISO8601()
  preferredDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  notes?: string;
}
