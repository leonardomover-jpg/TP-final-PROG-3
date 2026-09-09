import { IsIn, IsInt, IsNumber, IsOptional, IsPositive, IsString, Min, MaxLength, MinLength } from 'class-validator';

export class UpdateProductDto {
  // Reasignar el producto a otra sucursal (o a una por primera vez). No
  // hay forma de "desasignar" de vuelta a compartido en esta etapa (mismo
  // criterio que el resto de los campos opcionales de este DTO: sin
  // convención existente de unset-a-null, no se inventa una acá).
  @IsOptional()
  @IsString()
  branchId?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  sku?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  category?: string;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  price?: number;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  unit?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  minStock?: number;

  @IsOptional()
  @IsIn(['active', 'inactive'])
  status?: 'active' | 'inactive';
}
