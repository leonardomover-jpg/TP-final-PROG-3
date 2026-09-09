import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export class SaleItemDto {
  @IsIn(['service', 'product'])
  itemType: 'service' | 'product';

  // Exactamente uno de serviceId/productId, según itemType — validado en
  // el service (no acá, para no duplicar la regla con @ValidateIf por
  // cada combinación).
  @IsOptional()
  @IsString()
  serviceId?: string;

  @IsOptional()
  @IsString()
  productId?: string;

  @IsInt()
  @Min(1)
  quantity: number;
}

export class SalePaymentDto {
  @IsIn(['cash', 'card', 'transfer', 'other'])
  method: 'cash' | 'card' | 'transfer' | 'other';

  @IsNumber()
  @IsPositive()
  amount: number;
}

export class CreateSaleDto {
  @IsString()
  branchId: string;

  @IsString()
  cashRegisterId: string;

  @IsOptional()
  @IsString()
  clientId?: string;

  @IsOptional()
  @IsString()
  professionalId?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SaleItemDto)
  items: SaleItemDto[];

  // Pagos combinados (punto de la Etapa 12 del roadmap): la suma tiene
  // que dar exactamente el total de los ítems, validado en el service.
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SalePaymentDto)
  payments: SalePaymentDto[];
}
