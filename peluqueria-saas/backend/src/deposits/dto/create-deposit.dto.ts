import { IsNumber, IsPositive, IsString } from 'class-validator';

export class CreateDepositDto {
  @IsString()
  appointmentId: string;

  @IsNumber()
  @IsPositive()
  amount: number;
}
