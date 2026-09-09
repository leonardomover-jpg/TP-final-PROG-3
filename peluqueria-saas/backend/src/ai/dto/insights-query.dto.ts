import { IsISO8601, IsOptional, IsString } from 'class-validator';

// Mismo shape que DashboardQueryDto (Etapa 20) — los insights se calculan
// sobre el mismo período/sucursal que el dashboard, así que reusan el
// mismo filtro. No se importa esa clase para no acoplar los DTOs de dos
// módulos distintos a una misma definición que podría evolucionar
// distinto en cada uno.
export class InsightsQueryDto {
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
