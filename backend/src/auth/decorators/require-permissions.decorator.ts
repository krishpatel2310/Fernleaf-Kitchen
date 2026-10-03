import { SetMetadata, CustomDecorator } from '@nestjs/common';

export const PERMISSIONS_KEY = 'permissions';
export const ANY_PERMISSIONS_KEY = 'any_permissions';

/**
 * Decorator to require all specified permissions to access a handler/controller.
 * Permission checks resolve against the user's role-assigned permissions.
 * Example: @RequirePermissions('orders.read', 'orders.create')
 */
export const RequirePermissions = (
  ...permissions: string[]
): CustomDecorator<string> => SetMetadata(PERMISSIONS_KEY, permissions);

/**
 * Decorator to require at least one of the specified permissions to access a handler/controller.
 * Example: @RequireAnyPermission('dispatch.read', 'driver.read_own_deliveries')
 */
export const RequireAnyPermission = (
  ...permissions: string[]
): CustomDecorator<string> => SetMetadata(ANY_PERMISSIONS_KEY, permissions);
