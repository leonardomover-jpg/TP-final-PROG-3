import { IsIn, IsOptional, IsString } from 'class-validator';

export class ListProductsQueryDto {
  // Alertas de stock mínimo (punto de la Etapa 11 del roadmap): filtra a
  // los productos donde stock <= minStock, en vez de un endpoint aparte.
  // String en vez de boolean a propósito: la conversión boolean de
  // class-transformer sobre query params ("false" sigue siendo string no
  // vacío) es una trampa conocida — se compara como string en el service.
  @IsOptional()
  @IsIn(['true', 'false'])
  lowStock?: string;

  // Etapa 19: productos de ESA sucursal + los compartidos (branchId
  // null) — nunca los de OTRA sucursal puntual. Sin este filtro, se
  // listan todos (compartidos + de cualquier sucursal), igual que antes.
  @IsOptional()
  @IsString()
  branchId?: string;
}
