import { IsISO8601, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateAppointmentDto {
  @IsString()
  branchId: string;

  @IsString()
  professionalId: string;

  @IsString()
  clientId: string;

  @IsString()
  serviceId: string;

  // Fecha y hora de inicio, ISO 8601 (ej. "2026-03-11T14:00:00.000Z").
  // endAt se calcula a partir de la duración del servicio, no se recibe.
  @IsISO8601()
  startAt: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
