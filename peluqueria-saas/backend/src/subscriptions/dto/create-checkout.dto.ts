import { IsOptional, IsUrl } from 'class-validator';

export class CreateCheckoutDto {
  @IsOptional()
  @IsUrl({ require_tld: false })
  successUrl?: string;

  @IsOptional()
  @IsUrl({ require_tld: false })
  failureUrl?: string;

  @IsOptional()
  @IsUrl({ require_tld: false })
  pendingUrl?: string;
}
