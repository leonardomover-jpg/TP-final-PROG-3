import { IsDateString, IsNumber, IsOptional, IsPositive, IsString, MaxLength, MinLength } from 'class-validator';

export class IssueGiftCardDto {
  // Si no se manda, se genera un código único aleatorio (ver GiftCardsService.generateCode).
  @IsOptional()
  @IsString()
  @MinLength(4)
  @MaxLength(30)
  code?: string;

  @IsOptional()
  @IsString()
  clientId?: string;

  @IsNumber()
  @IsPositive()
  initialBalance: number;

  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}
