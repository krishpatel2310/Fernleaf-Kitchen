import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from '../decorators/require-permissions.decorator';
import { AuthenticatedUser } from '../decorators/current-user.decorator';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user as AuthenticatedUser;

    if (!user || !user.permissions) {
      throw new ForbiddenException(
        'User lacks authenticated permission context to access this resource',
      );
    }

    const userPermissions = new Set(user.permissions);
    const hasAllRequired = requiredPermissions.every((permission) =>
      userPermissions.has(permission),
    );

    if (!hasAllRequired) {
      const missing = requiredPermissions.filter(
        (permission) => !userPermissions.has(permission),
      );
      throw new ForbiddenException(
        `Forbidden: Missing required permission(s): ${missing.join(', ')}`,
      );
    }

    return true;
  }
}
