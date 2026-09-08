import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

export class CreateCommunicationDto {
  @IsString()
  @MinLength(3)
  @MaxLength(150)
  title: string;

  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  body: string;

  @IsIn(['all', 'plan', 'tenants'])
  audienceType: 'all' | 'plan' | 'tenants';

  @ValidateIf((dto: CreateCommunicationDto) => dto.audienceType === 'plan')
  @IsString()
  planId?: string;

  @ValidateIf((dto: CreateCommunicationDto) => dto.audienceType === 'tenants')
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  tenantIds?: string[];
}
