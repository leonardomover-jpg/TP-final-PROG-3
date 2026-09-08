import {
  ArrayMaxSize,
  IsArray,
  IsEmail,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateProfessionalDto {
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  firstName: string;

  @IsString()
  @MinLength(2)
  @MaxLength(60)
  lastName: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  specialties?: string[];

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  commissionPercentage?: number;

  // Vínculo opcional a un User existente del mismo tenant (ej. el dueño
  // también atiende clientes) — ProfessionalsService valida que exista y
  // que no esté ya vinculado a otro profesional.
  @IsOptional()
  @IsString()
  userId?: string;

  @IsOptional()
  @IsIn(['active', 'inactive'])
  status?: 'active' | 'inactive';
}
