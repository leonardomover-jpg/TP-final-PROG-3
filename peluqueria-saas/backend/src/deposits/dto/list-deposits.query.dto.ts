import { IsOptional, IsString } from 'class-validator';

export class ListDepositsQueryDto {
  @IsOptional()
  @IsString()
  appointmentId?: string;
}
