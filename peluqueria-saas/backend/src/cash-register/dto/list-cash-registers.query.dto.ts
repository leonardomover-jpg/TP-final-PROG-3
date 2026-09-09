import { IsIn, IsOptional, IsString } from 'class-validator';

export class ListCashRegistersQueryDto {
  @IsOptional()
  @IsString()
  branchId?: string;

  @IsOptional()
  @IsIn(['open', 'closed'])
  status?: string;
}
