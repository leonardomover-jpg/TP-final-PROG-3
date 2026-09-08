import { ArrayMinSize, IsArray, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateRoleDto {
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  name: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  permissionKeys: string[];
}
