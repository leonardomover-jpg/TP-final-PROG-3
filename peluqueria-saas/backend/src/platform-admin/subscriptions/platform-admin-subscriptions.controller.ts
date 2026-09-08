import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { PlatformAdminSubscriptionsService } from './platform-admin-subscriptions.service';
import { ListSubscriptionsQueryDto } from './dto/list-subscriptions.query.dto';
import { PlatformAdminJwtAuthGuard } from '../auth/guards/platform-admin-jwt-auth.guard';
import { Public } from '../../auth/decorators/public.decorator';

@Public()
@UseGuards(PlatformAdminJwtAuthGuard)
@Controller('platform-admin/subscriptions')
export class PlatformAdminSubscriptionsController {
  constructor(private readonly subscriptionsService: PlatformAdminSubscriptionsService) {}

  @Get()
  findAll(@Query() query: ListSubscriptionsQueryDto) {
    return this.subscriptionsService.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.subscriptionsService.findOne(id);
  }
}
