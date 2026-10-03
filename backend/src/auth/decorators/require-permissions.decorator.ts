import { SetMetadata, CustomDecorator } from '@nestjs/common';

export const PERMISSIONS_KEY = 'permissions';

/**
 * Decorator to require one or more specific permissions to access a handler/controller.
 * Permission checks resolve against the user's role-assigned permissions.
 * Example: @RequirePermissions('orders.read', 'orders.create')
 */
export const RequirePermissions = (
  ...permissions: string[]
): CustomDecorator<string> => SetMetadata(PERMISSIONS_KEY, permissions);
