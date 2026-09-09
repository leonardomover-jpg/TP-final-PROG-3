import { IsNumber, IsPositive, IsString, MaxLength, MinLength } from 'class-validator';

export class RedeemGiftCardDto {
  @IsNumber()
  @IsPositive()
  amount: number;

  @IsString()
  @MinLength(2)
  @MaxLength(200)
  reason: string;
}
