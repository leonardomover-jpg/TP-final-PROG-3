import { IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class CloseCashRegisterDto {
  @IsNumber()
  @Min(0)
  closingAmount: number; // efectivo contado a mano

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
