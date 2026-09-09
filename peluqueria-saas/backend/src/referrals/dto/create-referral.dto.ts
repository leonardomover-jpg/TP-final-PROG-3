import { IsInt, IsOptional, IsPositive, IsString } from 'class-validator';

export class CreateReferralDto {
  @IsString()
  referrerClientId: string;

  @IsString()
  referredClientId: string;

  // Puntos que se otorgan al referente cuando el referido se marca completed
  // (POST /referrals/:id/complete) — no se acreditan al crear el referido.
  @IsOptional()
  @IsInt()
  @IsPositive()
  rewardPoints?: number;
}
