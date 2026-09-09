import { IsISO8601, IsOptional, IsString } from 'class-validator';

export class CommissionsQueryDto {
  @IsOptional()
  @IsString()
  professionalId?: string;

  @IsOptional()
  @IsISO8601()
  from?: string;

  @IsOptional()
  @IsISO8601()
  to?: string;
}
