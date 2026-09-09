import { IsBoolean } from 'class-validator';

export class SetHolidayOverrideDto {
  @IsBoolean()
  isOpen: boolean;
}
