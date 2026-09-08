import { IsIn, IsInt, IsNumber, IsPositive, IsString, Min, MinLength } from 'class-validator';

export class CreatePlanDto {
  @IsString()
  @MinLength(2)
  name: string;

  @IsNumber()
  @IsPositive()
  price: number;

  @IsIn(['monthly', 'yearly'])
  billingPeriod: 'monthly' | 'yearly';

  @IsInt()
  @Min(0)
  maxUsers: number;

  @IsInt()
  @Min(0)
  maxProfessionals: number;

  @IsInt()
  @Min(0)
  maxBranches: number;

  @IsInt()
  @Min(0)
  maxClients: number;
}
