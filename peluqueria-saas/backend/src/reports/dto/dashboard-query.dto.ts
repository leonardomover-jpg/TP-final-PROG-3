import { IsISO8601, IsOptional, IsString } from 'class-validator';

export class DashboardQueryDto {
  // Sin from/to: trae todo el historial. Mismo criterio que
  // CommissionsQueryDto (Etapa 12) — el frontend arma el rango (hoy, este
  // mes, personalizado) del lado cliente.
  @IsOptional()
  @IsISO8601()
  from?: string;

  @IsOptional()
  @IsISO8601()
  to?: string;

  @IsOptional()
  @IsString()
  branchId?: string;
}
