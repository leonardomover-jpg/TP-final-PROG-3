import { IsISO8601, IsOptional, IsString } from 'class-validator';

export class AvailabilityQueryDto {
  @IsISO8601()
  date: string;

  @IsOptional()
  @IsString()
  branchId?: string;

  @IsOptional()
  @IsString()
  professionalId?: string;
}
