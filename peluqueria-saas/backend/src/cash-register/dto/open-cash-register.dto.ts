import { IsNumber, IsString, Min } from 'class-validator';

export class OpenCashRegisterDto {
  @IsString()
  branchId: string;

  @IsNumber()
  @Min(0)
  openingAmount: number;
}
