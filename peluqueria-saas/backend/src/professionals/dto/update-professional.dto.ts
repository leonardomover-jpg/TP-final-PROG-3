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

export class UpdateProfessionalDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  firstName?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  lastName?: string;

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

  // null explícito desvincula al User actual (ver ProfessionalsService.update).
  @IsOptional()
  userId?: string | null;

  @IsOptional()
  @IsIn(['active', 'inactive'])
  status?: 'active' | 'inactive';
}
