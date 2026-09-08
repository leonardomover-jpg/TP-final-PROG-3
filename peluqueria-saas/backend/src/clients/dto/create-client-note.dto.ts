import { IsString, MaxLength, MinLength } from 'class-validator';

export class CreateClientNoteDto {
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  body: string;
}
