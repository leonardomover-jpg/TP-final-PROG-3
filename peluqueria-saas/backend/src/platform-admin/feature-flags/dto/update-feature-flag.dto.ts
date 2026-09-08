import { IsBoolean, IsOptional, IsString, MinLength } from 'class-validator';

export class UpdateFeatureFlagDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  description?: string;

  @IsOptional()
  @IsBoolean()
  globallyEnabled?: boolean;
}
