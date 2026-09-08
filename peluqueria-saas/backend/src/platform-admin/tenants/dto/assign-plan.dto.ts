import { IsString } from 'class-validator';

export class AssignPlanDto {
  @IsString()
  planId: string;
}
