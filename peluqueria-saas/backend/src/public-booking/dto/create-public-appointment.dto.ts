import { IsEmail, IsISO8601, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreatePublicAppointmentDto {
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  clientFirstName: string;

  @IsString()
  @MinLength(2)
  @MaxLength(80)
  clientLastName: string;

  // Al menos uno de los dos es obligatorio (validado en el service, no acá
  // — es una regla entre dos campos, no de uno solo) para poder ubicar al
  // cliente si repite reserva, y para que el negocio pueda contactarlo.
  @IsOptional()
  @IsString()
  @MaxLength(30)
  clientPhone?: string;

  @IsOptional()
  @IsEmail()
  clientEmail?: string;

  @IsString()
  branchId: string;

  @IsString()
  professionalId: string;

  @IsString()
  serviceId: string;

  @IsISO8601()
  startAt: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
