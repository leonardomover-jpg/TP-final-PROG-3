import { IsIn, IsISO8601, IsOptional, IsString } from 'class-validator';

export class ExportQueryDto {
  @IsOptional()
  @IsISO8601()
  from?: string;

  @IsOptional()
  @IsISO8601()
  to?: string;

  @IsOptional()
  @IsString()
  branchId?: string;

  @IsIn(['csv', 'pdf', 'xlsx'])
  format: 'csv' | 'pdf' | 'xlsx';
}
