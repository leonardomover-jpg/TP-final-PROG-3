import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AuthenticatedPlatformAdmin } from '../platform-admin-auth.types';

export const CurrentPlatformAdmin = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedPlatformAdmin => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);
