import { IsEmail, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class RegisterTenantDto {
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  businessName: string;

  @IsString()
  @MinLength(3)
  @MaxLength(40)
  @Matches(/^[a-z0-9-]+$/, {
    message: 'El identificador del negocio solo puede tener minúsculas, números y guiones.',
  })
  slug: string;

  @IsString()
  @MinLength(2)
  @MaxLength(60)
  firstName: string;

  @IsString()
  @MinLength(2)
  @MaxLength(60)
  lastName: string;

  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password: string;
}
