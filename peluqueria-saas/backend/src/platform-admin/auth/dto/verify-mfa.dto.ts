import { IsString, Length } from 'class-validator';

export class VerifyMfaDto {
  @IsString()
  mfaChallengeToken: string;

  @IsString()
  @Length(6, 6)
  code: string;
}
