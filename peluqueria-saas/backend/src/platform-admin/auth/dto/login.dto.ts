import { IsEmail, IsString } from 'class-validator';

export class PlatformAdminLoginDto {
  @IsEmail()
  email: string;

  @IsString()
  password: string;
}
