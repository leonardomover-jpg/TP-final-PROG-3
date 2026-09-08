import { IsBoolean, IsOptional, IsString, Matches, MinLength } from 'class-validator';

export class CreateFeatureFlagDto {
  @IsString()
  @Matches(/^[a-z0-9_]+$/, { message: 'La key solo puede tener minúsculas, números y guiones bajos.' })
  key: string;

  @IsString()
  @MinLength(2)
  name: string;

  @IsString()
  @MinLength(2)
  description: string;

  @IsOptional()
  @IsBoolean()
  globallyEnabled?: boolean;
}
