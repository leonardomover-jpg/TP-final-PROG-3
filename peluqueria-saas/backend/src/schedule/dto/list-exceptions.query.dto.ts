import { IsOptional, IsString } from 'class-validator';

export class ListExceptionsQueryDto {
  @IsOptional()
  @IsString()
  branchId?: string;

  @IsOptional()
  @IsString()
  professionalId?: string;
}
