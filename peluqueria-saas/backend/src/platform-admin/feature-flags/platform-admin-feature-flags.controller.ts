import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { PlatformAdminFeatureFlagsService } from './platform-admin-feature-flags.service';
import { CreateFeatureFlagDto } from './dto/create-feature-flag.dto';
import { UpdateFeatureFlagDto } from './dto/update-feature-flag.dto';
import { PlatformAdminJwtAuthGuard } from '../auth/guards/platform-admin-jwt-auth.guard';
import { Public } from '../../auth/decorators/public.decorator';

@Public()
@UseGuards(PlatformAdminJwtAuthGuard)
@Controller('platform-admin/feature-flags')
export class PlatformAdminFeatureFlagsController {
  constructor(private readonly featureFlagsService: PlatformAdminFeatureFlagsService) {}

  @Get()
  findAll() {
    return this.featureFlagsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.featureFlagsService.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateFeatureFlagDto) {
    return this.featureFlagsService.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateFeatureFlagDto) {
    return this.featureFlagsService.update(id, dto);
  }
}
