import { IsISO8601, IsIn, IsOptional, IsString } from 'class-validator';

export class ListAppointmentsQueryDto {
  // Rango de fechas — las vistas de día/semana/mes/lista del frontend son
  // todas el mismo endpoint con distinto from/to (un día, una semana, un
  // mes, o un rango amplio para "lista"); no se modela una vista distinta
  // por endpoint porque el filtro es siempre el mismo (rango de startAt).
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
  professionalId?: string;

  @IsOptional()
  @IsString()
  clientId?: string;

  @IsOptional()
  @IsIn(['pending', 'confirmed', 'completed', 'cancelled', 'no_show'])
  status?: string;
}
