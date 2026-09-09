import { IsISO8601, IsNumber, IsOptional, IsPositive, IsString, MaxLength } from 'class-validator';

export class CreateExpenseDto {
  @IsOptional()
  @IsString()
  branchId?: string;

  @IsOptional()
  @IsString()
  cashRegisterId?: string; // si salió del efectivo de una caja abierta (entra en el arqueo al cerrar)

  @IsOptional()
  @IsString()
  @MaxLength(60)
  category?: string;

  @IsNumber()
  @IsPositive()
  amount: number;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  description?: string;

  @IsOptional()
  @IsISO8601()
  date?: string;
}
