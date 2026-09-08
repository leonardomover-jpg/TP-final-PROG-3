import { IsString } from 'class-validator';

export class PlatformAdminRefreshDto {
  @IsString()
  refreshToken: string;
}
