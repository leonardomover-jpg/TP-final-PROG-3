import { IsInt, IsPositive, IsString, MaxLength, MinLength } from 'class-validator';

export class AwardPointsDto {
  @IsString()
  clientId: string;

  @IsInt()
  @IsPositive()
  amount: number;

  @IsString()
  @MinLength(2)
  @MaxLength(200)
  reason: string;
}
