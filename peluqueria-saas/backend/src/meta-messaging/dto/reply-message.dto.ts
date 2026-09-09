import { IsIn, IsString, MaxLength, MinLength } from 'class-validator';

export class ReplyMessageDto {
  @IsIn(['facebook', 'instagram'])
  provider: 'facebook' | 'instagram';

  // El PSID (Facebook) / IGSID (Instagram) del remitente — llega en el
  // mensaje entrante (`from`, ver el webhook) y se usa tal cual para
  // responderle a esa misma persona.
  @IsString()
  recipientId: string;

  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  message: string;
}
