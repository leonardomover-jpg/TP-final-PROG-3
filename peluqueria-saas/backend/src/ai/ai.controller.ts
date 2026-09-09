import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AiService } from './ai.service';
import { InsightsQueryDto } from './dto/insights-query.dto';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { FeatureFlagGuard } from '../feature-flags/guards/feature-flag.guard';
import { RequiresFeature } from '../feature-flags/decorators/requires-feature.decorator';

@UseGuards(FeatureFlagGuard)
@RequiresFeature('ai')
@Controller('ai')
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @RequirePermissions('ia.ver')
  @Get('insights')
  getInsights(@Query() query: InsightsQueryDto) {
    return this.aiService.getInsights(query);
  }
}
