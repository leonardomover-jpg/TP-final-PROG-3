import { ArrayMaxSize, IsArray, IsString } from 'class-validator';

// Reemplaza la lista completa de profesionales habilitados (mismo criterio
// que SetScheduleDto de la Etapa 7: "quiénes atienden este servicio" se
// edita como un todo, no de a un alta/baja incremental).
export class SetProfessionalsDto {
  @IsArray()
  @ArrayMaxSize(200)
  @IsString({ each: true })
  professionalIds: string[];
}
