import { IsIn, IsISO8601, IsOptional, IsString } from 'class-validator';

export class ListSalesQueryDto {
  @IsOptional()
  @IsISO8601()
  from?: string;

  @IsOptional()
  @IsISO8601()
  to?: string;

  @IsOptional()
  @IsString()
  branchId?: string;

  @IsOptional()
  @IsString()
  clientId?: string;

  @IsOptional()
  @IsString()
  professionalId?: string;

  @IsOptional()
  @IsIn(['completed', 'cancelled'])
  status?: string;
}
