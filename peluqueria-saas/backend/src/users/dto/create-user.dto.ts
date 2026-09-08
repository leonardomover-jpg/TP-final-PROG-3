import {
  ArrayMinSize,
  IsArray,
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateUserDto {
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

  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  roleIds: string[];

  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  branchIds: string[];
}
