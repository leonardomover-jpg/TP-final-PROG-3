import { IsString, MinLength } from 'class-validator';

export class ConnectWhatsAppDto {
  @IsString()
  @MinLength(10)
  accessToken: string;

  @IsString()
  @MinLength(5)
  phoneNumberId: string;

  @IsString()
  @MinLength(10)
  appSecret: string;

  // Token que el propio negocio elige y después pega en el dashboard de
  // Meta al configurar la URL del webhook (handshake GET).
  @IsString()
  @MinLength(8)
  verifyToken: string;
}
