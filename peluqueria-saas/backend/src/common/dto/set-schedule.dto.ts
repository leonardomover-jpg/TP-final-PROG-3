import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsInt, IsString, Matches, Max, Min, ValidateNested } from 'class-validator';

export const TIME_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/; // "HH:mm", 24hs

export class ScheduleEntryDto {
  @IsInt()
  @Min(0)
  @Max(6) // 0 = domingo … 6 = sábado (getDay() de JS)
  dayOfWeek: number;

  @IsString()
  @Matches(TIME_REGEX, { message: 'startTime debe tener el formato HH:mm (24hs).' })
  startTime: string;

  @IsString()
  @Matches(TIME_REGEX, { message: 'endTime debe tener el formato HH:mm (24hs).' })
  endTime: string;
}

// Reemplaza el horario semanal completo (no un alta incremental): se edita
// "el horario" (de un profesional — Etapa 7 — o de una sucursal — Etapa 9)
// como un todo, no entrada por entrada — evita estados intermedios
// inconsistentes (ej. dos rangos que se superponen porque uno quedó de una
// edición anterior sin borrar). Compartido entre ambos módulos porque el
// shape y la validación son idénticos.
export class SetScheduleDto {
  @IsArray()
  @ArrayMaxSize(7 * 4) // margen generoso para varios rangos por día (ej. mañana/tarde)
  @ValidateNested({ each: true })
  @Type(() => ScheduleEntryDto)
  entries: ScheduleEntryDto[];
}
