import { IsISO8601, IsInt, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

export class CreateHolidayDto {
  @IsISO8601()
  date: string;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name: string;

  @IsInt()
  @Min(2020)
  @Max(2100)
  year: number;
}
