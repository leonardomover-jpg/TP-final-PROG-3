import { IsArray, IsString } from 'class-validator';

export class SetPlanFeaturesDto {
  @IsArray()
  @IsString({ each: true })
  featureFlagKeys: string[];
}
