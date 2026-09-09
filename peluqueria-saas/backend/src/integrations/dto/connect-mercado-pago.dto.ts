import { IsOptional, IsString, MinLength } from 'class-validator';

export class ConnectMercadoPagoDto {
  @IsString()
  @MinLength(10)
  accessToken: string;

  @IsOptional()
  @IsString()
  publicKey?: string;

  @IsString()
  @MinLength(10)
  webhookSecret: string;
}
