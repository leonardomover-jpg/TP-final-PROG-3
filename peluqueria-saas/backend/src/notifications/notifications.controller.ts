import { Controller, Get, Param, Patch } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/auth.types';

// Sin @RequirePermissions a propósito, igual que /plan (PlanInfoController):
// cualquier usuario autenticado del negocio ve y administra SU PROPIA
// bandeja, nunca la de otro usuario del mismo tenant.
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.notificationsService.list(user.tenantId, user.userId);
  }

  @Get('unread-count')
  unreadCount(@CurrentUser() user: AuthenticatedUser) {
    return this.notificationsService.unreadCount(user.tenantId, user.userId).then((count) => ({ count }));
  }

  @Patch(':id/read')
  markRead(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.notificationsService.markNotificationRead(user.tenantId, user.userId, id);
  }

  @Patch('communications/:id/read')
  markCommunicationRead(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.notificationsService.markCommunicationRead(user.tenantId, user.userId, id);
  }

  @Patch('read-all')
  markAllRead(@CurrentUser() user: AuthenticatedUser) {
    return this.notificationsService.markAllRead(user.tenantId, user.userId);
  }
}
