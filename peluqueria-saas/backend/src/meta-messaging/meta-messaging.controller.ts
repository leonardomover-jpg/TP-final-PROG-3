import { Body, Controller, Post } from '@nestjs/common';
import { MetaMessagingService } from './meta-messaging.service';
import { ReplyMessageDto } from './dto/reply-message.dto';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';

@Controller('meta-messaging')
export class MetaMessagingController {
  constructor(private readonly metaMessagingService: MetaMessagingService) {}

  @RequirePermissions('mensajes.gestionar')
  @Post('reply')
  reply(@Body() dto: ReplyMessageDto) {
    return this.metaMessagingService.reply(dto);
  }
}
