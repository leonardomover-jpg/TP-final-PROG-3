import { IsBoolean, IsISO8601, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { TIME_REGEX } from '../../common/dto/set-schedule.dto';

// Exactamente uno de branchId/professionalId (XOR) y, si isClosed=false,
// ambos horarios son obligatorios — se valida en ScheduleService (no acá):
// Prisma/class-validator no expresan bien reglas cruzadas entre campos
// opcionales sin decoradores custom, y para dos reglas simples no se
// justifica esa fricción (doc `13-HORARIOS.md` §3).
export class CreateExceptionDto {
  @IsOptional()
  @IsString()
  branchId?: string;

  @IsOptional()
  @IsString()
  professionalId?: string;

  @IsISO8601()
  date: string;

  @IsOptional()
  @IsBoolean()
  isClosed?: boolean; // default true (ver ScheduleService)

  @IsOptional()
  @IsString()
  @Matches(TIME_REGEX, { message: 'startTime debe tener el formato HH:mm (24hs).' })
  startTime?: string;

  @IsOptional()
  @IsString()
  @Matches(TIME_REGEX, { message: 'endTime debe tener el formato HH:mm (24hs).' })
  endTime?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  reason?: string;
}
