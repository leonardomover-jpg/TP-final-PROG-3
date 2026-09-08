import { IsString } from 'class-validator';

export class SelectPlanDto {
  @IsString()
  planId: string;
}
