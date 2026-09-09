import { IsIn, IsOptional, IsString } from 'class-validator';

export class ListWaitlistQueryDto {
  @IsOptional()
  @IsIn(['waiting', 'booked', 'cancelled'])
  status?: string;

  @IsOptional()
  @IsString()
  clientId?: string;
}
