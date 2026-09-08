import { IsEmail, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class CreateTenantDto {
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

  @IsOptional()
  @IsString()
  planId?: string;

  @IsString()
  @MinLength(2)
  @MaxLength(60)
  adminFirstName: string;

  @IsString()
  @MinLength(2)
  @MaxLength(60)
  adminLastName: string;

  @IsEmail()
  adminEmail: string;

  @IsString()
  @MinLength(8)
  @MaxLength(72)
  adminPassword: string;
}
