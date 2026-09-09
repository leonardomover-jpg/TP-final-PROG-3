import { IsString, MinLength } from 'class-validator';

// Compartido por Facebook (Page) e Instagram (IG Business Account) —
// misma forma exacta de credenciales, ver `meta-client.ts`.
export class ConnectMetaMessagingDto {
  @IsString()
  @MinLength(10)
  accessToken: string;

  @IsString()
  @MinLength(5)
  externalAccountId: string;

  @IsString()
  @MinLength(10)
  appSecret: string;

  // Token que el propio negocio elige y después pega en el dashboard de
  // Meta al configurar la URL del webhook (handshake GET).
  @IsString()
  @MinLength(8)
  verifyToken: string;
}
