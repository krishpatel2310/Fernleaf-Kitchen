import { Test, TestingModule } from '@nestjs/testing';
import {
  UnauthorizedException,
  ForbiddenException,
  ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { PermissionsGuard } from './guards/permissions.guard';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from './decorators/current-user.decorator';
import { UserStatus } from '@prisma/client';
import { ROLE_DEFINITIONS } from '../../prisma/seed';

describe('Authentication & RBAC Authorization Boundaries', () => {
  let authService: AuthService;
  let jwtAuthGuard: JwtAuthGuard;
  let permissionsGuard: PermissionsGuard;
  let reflector: Reflector;
  let prisma: PrismaService;

  // Standard mock user factory
  const createMockDbUser = (
    email: string,
    roleName: string,
    permissions: string[],
    status: UserStatus = UserStatus.ACTIVE,
  ) => ({
    id: `user-${roleName.toLowerCase()}-123`,
    email,
    passwordHash: bcrypt.hashSync('Test@1234', 10),
    name: `${roleName} User`,
    roleId: `role-${roleName.toLowerCase()}`,
    status,
    role: {
      id: `role-${roleName.toLowerCase()}`,
      name: roleName,
      permissions: permissions.map((p) => ({
        permission: { key: p, description: p },
      })),
    },
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  const adminPermissions = ROLE_DEFINITIONS.ADMIN.permissions;
  const kitchenPermissions = ROLE_DEFINITIONS.KITCHEN.permissions;
  const dispatchPermissions = ROLE_DEFINITIONS.DISPATCH.permissions;
  const driverPermissions = ROLE_DEFINITIONS.DRIVER.permissions;

  beforeEach(async () => {
    const mockPrisma = {
      user: {
        findUnique: jest.fn(),
      },
      role: {
        findUnique: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        JwtAuthGuard,
        PermissionsGuard,
        Reflector,
        {
          provide: JwtService,
          useValue: {
            sign: jest.fn().mockReturnValue('mock-jwt-token'),
          },
        },
        {
          provide: PrismaService,
          useValue: mockPrisma,
        },
      ],
    }).compile();

    authService = module.get<AuthService>(AuthService);
    jwtAuthGuard = module.get<JwtAuthGuard>(JwtAuthGuard);
    permissionsGuard = module.get<PermissionsGuard>(PermissionsGuard);
    reflector = module.get<Reflector>(Reflector);
    prisma = module.get<PrismaService>(PrismaService);
  });

  // Helper to create mock ExecutionContext
  const createMockContext = (
    user?: AuthenticatedUser,
    isPublic = false,
    requiredPermissions?: string[],
  ): ExecutionContext => {
    const handler = () => {};
    const classRef = class {};

    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockImplementation((key: string) => {
        if (key === 'isPublic') return isPublic;
        if (key === 'permissions') return requiredPermissions;
        return undefined;
      });

    return {
      getHandler: () => handler,
      getClass: () => classRef,
      switchToHttp: () => ({
        getRequest: () => ({
          user,
          headers: user ? { authorization: 'Bearer mock-jwt-token' } : {},
        }),
        getResponse: () => ({}),
        getNext: () => ({}),
      }),
    } as unknown as ExecutionContext;
  };

  // ---------------------------------------------------------------------------
  // Test 1: Admin can authenticate
  // ---------------------------------------------------------------------------
  it('1. Admin can authenticate with correct credentials', async () => {
    const adminUser = createMockDbUser(
      'admin@test.com',
      'ADMIN',
      adminPermissions,
    );
    jest.spyOn(prisma.user, 'findUnique').mockResolvedValue(adminUser as any);

    const result = await authService.login({
      email: 'admin@test.com',
      password: 'Test@1234',
    });

    expect(result.accessToken).toBe('mock-jwt-token');
    expect(result.user.email).toBe('admin@test.com');
    expect(result.user.roleName).toBe('ADMIN');
    expect(result.user.permissions).toEqual(adminPermissions);
  });

  // ---------------------------------------------------------------------------
  // Test 2: Kitchen can authenticate
  // ---------------------------------------------------------------------------
  it('2. Kitchen can authenticate with correct credentials', async () => {
    const kitchenUser = createMockDbUser(
      'kitchen@test.com',
      'KITCHEN',
      kitchenPermissions,
    );
    jest.spyOn(prisma.user, 'findUnique').mockResolvedValue(kitchenUser as any);

    const result = await authService.login({
      email: 'kitchen@test.com',
      password: 'Test@1234',
    });

    expect(result.accessToken).toBe('mock-jwt-token');
    expect(result.user.email).toBe('kitchen@test.com');
    expect(result.user.roleName).toBe('KITCHEN');
    expect(result.user.permissions).toEqual(kitchenPermissions);
  });

  // ---------------------------------------------------------------------------
  // Test 3: Dispatch can authenticate
  // ---------------------------------------------------------------------------
  it('3. Dispatch can authenticate with correct credentials', async () => {
    const dispatchUser = createMockDbUser(
      'dispatch@test.com',
      'DISPATCH',
      dispatchPermissions,
    );
    jest
      .spyOn(prisma.user, 'findUnique')
      .mockResolvedValue(dispatchUser as any);

    const result = await authService.login({
      email: 'dispatch@test.com',
      password: 'Test@1234',
    });

    expect(result.accessToken).toBe('mock-jwt-token');
    expect(result.user.email).toBe('dispatch@test.com');
    expect(result.user.roleName).toBe('DISPATCH');
    expect(result.user.permissions).toEqual(dispatchPermissions);
  });

  // ---------------------------------------------------------------------------
  // Test 4: Driver can authenticate
  // ---------------------------------------------------------------------------
  it('4. Driver can authenticate with correct credentials', async () => {
    const driverUser = createMockDbUser(
      'driver@test.com',
      'DRIVER',
      driverPermissions,
    );
    jest.spyOn(prisma.user, 'findUnique').mockResolvedValue(driverUser as any);

    const result = await authService.login({
      email: 'driver@test.com',
      password: 'Test@1234',
    });

    expect(result.accessToken).toBe('mock-jwt-token');
    expect(result.user.email).toBe('driver@test.com');
    expect(result.user.roleName).toBe('DRIVER');
    expect(result.user.permissions).toEqual(driverPermissions);
  });

  // ---------------------------------------------------------------------------
  // Test 5: Invalid password fails
  // ---------------------------------------------------------------------------
  it('5. Invalid password fails with generic unauthorized error', async () => {
    const adminUser = createMockDbUser(
      'admin@test.com',
      'ADMIN',
      adminPermissions,
    );
    jest.spyOn(prisma.user, 'findUnique').mockResolvedValue(adminUser as any);

    await expect(
      authService.login({
        email: 'admin@test.com',
        password: 'WrongPassword@999',
      }),
    ).rejects.toThrow(new UnauthorizedException('Invalid email or password'));
  });

  // ---------------------------------------------------------------------------
  // Test 6: Unknown user fails
  // ---------------------------------------------------------------------------
  it('6. Unknown user fails with generic unauthorized error without enumeration', async () => {
    jest.spyOn(prisma.user, 'findUnique').mockResolvedValue(null);

    await expect(
      authService.login({
        email: 'nonexistent@test.com',
        password: 'AnyPassword@123',
      }),
    ).rejects.toThrow(new UnauthorizedException('Invalid email or password'));
  });

  // ---------------------------------------------------------------------------
  // Test 7: Inactive user cannot authenticate
  // ---------------------------------------------------------------------------
  it('7. Inactive user cannot authenticate even with correct password', async () => {
    const inactiveUser = createMockDbUser(
      'admin@test.com',
      'ADMIN',
      adminPermissions,
      UserStatus.INACTIVE,
    );
    jest
      .spyOn(prisma.user, 'findUnique')
      .mockResolvedValue(inactiveUser as any);

    await expect(
      authService.login({
        email: 'admin@test.com',
        password: 'Test@1234',
      }),
    ).rejects.toThrow(
      new UnauthorizedException(
        'Account is inactive. Please contact an administrator.',
      ),
    );
  });

  // ---------------------------------------------------------------------------
  // Test 8: Unauthenticated request to a protected endpoint returns 401
  // ---------------------------------------------------------------------------
  it('8. Unauthenticated request to a protected endpoint returns 401 Unauthorized', async () => {
    const context = createMockContext(undefined, false);

    // JwtAuthGuard canActivate calls super.canActivate if not public
    // Since passport is not initialized with request here, it throws Unauthorized
    await expect(jwtAuthGuard.canActivate(context)).rejects.toThrow();
  });

  // ---------------------------------------------------------------------------
  // Test 9: Authenticated user without required permission receives 403 Forbidden
  // ---------------------------------------------------------------------------
  it('9. Authenticated user without required permission receives 403 Forbidden', () => {
    const driverUser: AuthenticatedUser = {
      id: 'driver-1',
      email: 'driver@test.com',
      name: 'Driver',
      roleId: 'role-driver',
      roleName: 'DRIVER',
      permissions: driverPermissions,
    };

    const context = createMockContext(driverUser, false, ['catalogue.manage']);

    expect(() => permissionsGuard.canActivate(context)).toThrow(
      ForbiddenException,
    );
    expect(() => permissionsGuard.canActivate(context)).toThrow(
      /Missing required permission\(s\): catalogue\.manage/,
    );
  });

  // ---------------------------------------------------------------------------
  // Test 10: Admin has administrative permissions
  // ---------------------------------------------------------------------------
  it('10. Admin has full administrative capabilities', () => {
    const adminUser: AuthenticatedUser = {
      id: 'admin-1',
      email: 'admin@test.com',
      name: 'Admin',
      roleId: 'role-admin',
      roleName: 'ADMIN',
      permissions: adminPermissions,
    };

    const adminRequiredCapabilities = [
      'catalogue.manage',
      'menu.manage',
      'pricing.manage',
      'companies.manage',
      'employees.manage',
      'billing.manage',
      'settings.manage',
      'orders.override',
      'kitchen.force_complete',
      'dashboard.admin',
    ];

    for (const cap of adminRequiredCapabilities) {
      const context = createMockContext(adminUser, false, [cap]);
      expect(permissionsGuard.canActivate(context)).toBe(true);
    }
  });

  // ---------------------------------------------------------------------------
  // Test 11: Kitchen does NOT have administrative permissions
  // ---------------------------------------------------------------------------
  it('11. Kitchen does NOT have administrative permissions', () => {
    const kitchenUser: AuthenticatedUser = {
      id: 'kitchen-1',
      email: 'kitchen@test.com',
      name: 'Kitchen',
      roleId: 'role-kitchen',
      roleName: 'KITCHEN',
      permissions: kitchenPermissions,
    };

    const adminCapabilities = [
      'catalogue.manage',
      'pricing.manage',
      'companies.manage',
      'billing.manage',
      'settings.manage',
      'orders.override',
    ];

    for (const cap of adminCapabilities) {
      const context = createMockContext(kitchenUser, false, [cap]);
      expect(() => permissionsGuard.canActivate(context)).toThrow(
        ForbiddenException,
      );
    }
  });

  // ---------------------------------------------------------------------------
  // Test 12: Dispatch does NOT have administrative permissions
  // ---------------------------------------------------------------------------
  it('12. Dispatch does NOT have administrative permissions', () => {
    const dispatchUser: AuthenticatedUser = {
      id: 'dispatch-1',
      email: 'dispatch@test.com',
      name: 'Dispatch',
      roleId: 'role-dispatch',
      roleName: 'DISPATCH',
      permissions: dispatchPermissions,
    };

    const adminCapabilities = [
      'catalogue.manage',
      'pricing.manage',
      'companies.manage',
      'billing.manage',
      'settings.manage',
      'orders.override',
      'kitchen.start',
    ];

    for (const cap of adminCapabilities) {
      const context = createMockContext(dispatchUser, false, [cap]);
      expect(() => permissionsGuard.canActivate(context)).toThrow(
        ForbiddenException,
      );
    }
  });

  // ---------------------------------------------------------------------------
  // Test 13: Driver does NOT have administrative permissions
  // ---------------------------------------------------------------------------
  it('13. Driver does NOT have administrative, catalogue, pricing, billing, or kitchen permissions', () => {
    const driverUser: AuthenticatedUser = {
      id: 'driver-1',
      email: 'driver@test.com',
      name: 'Driver',
      roleId: 'role-driver',
      roleName: 'DRIVER',
      permissions: driverPermissions,
    };

    const forbiddenForDriver = [
      'catalogue.read',
      'catalogue.manage',
      'pricing.read',
      'pricing.manage',
      'companies.read',
      'companies.manage',
      'employees.read',
      'employees.manage',
      'billing.read',
      'billing.manage',
      'kitchen.read',
      'kitchen.start',
      'kitchen.finish',
      'orders.override',
    ];

    for (const cap of forbiddenForDriver) {
      const context = createMockContext(driverUser, false, [cap]);
      expect(() => permissionsGuard.canActivate(context)).toThrow(
        ForbiddenException,
      );
    }
  });

  // ---------------------------------------------------------------------------
  // Test 14: Driver has driver delivery permissions
  // ---------------------------------------------------------------------------
  it('14. Driver has driver delivery permissions', () => {
    const driverUser: AuthenticatedUser = {
      id: 'driver-1',
      email: 'driver@test.com',
      name: 'Driver',
      roleId: 'role-driver',
      roleName: 'DRIVER',
      permissions: driverPermissions,
    };

    const driverCapabilities = [
      'driver.read_own_deliveries',
      'driver.mark_delivered',
      'dashboard.driver',
    ];

    for (const cap of driverCapabilities) {
      const context = createMockContext(driverUser, false, [cap]);
      expect(permissionsGuard.canActivate(context)).toBe(true);
    }
  });

  // ---------------------------------------------------------------------------
  // Test 15: Kitchen has kitchen permissions
  // ---------------------------------------------------------------------------
  it('15. Kitchen has kitchen prep permissions', () => {
    const kitchenUser: AuthenticatedUser = {
      id: 'kitchen-1',
      email: 'kitchen@test.com',
      name: 'Kitchen',
      roleId: 'role-kitchen',
      roleName: 'KITCHEN',
      permissions: kitchenPermissions,
    };

    const kitchenCapabilities = [
      'kitchen.read',
      'kitchen.start',
      'kitchen.finish',
      'dashboard.kitchen',
      'orders.read',
      'catalogue.read',
    ];

    for (const cap of kitchenCapabilities) {
      const context = createMockContext(kitchenUser, false, [cap]);
      expect(permissionsGuard.canActivate(context)).toBe(true);
    }
  });

  // ---------------------------------------------------------------------------
  // Test 16: Dispatch has dispatch permissions
  // ---------------------------------------------------------------------------
  it('16. Dispatch has dispatch and driver assignment permissions', () => {
    const dispatchUser: AuthenticatedUser = {
      id: 'dispatch-1',
      email: 'dispatch@test.com',
      name: 'Dispatch',
      roleId: 'role-dispatch',
      roleName: 'DISPATCH',
      permissions: dispatchPermissions,
    };

    const dispatchCapabilities = [
      'dispatch.read',
      'dispatch.assign_driver',
      'dispatch.update_status',
      'dashboard.dispatch',
      'orders.read',
    ];

    for (const cap of dispatchCapabilities) {
      const context = createMockContext(dispatchUser, false, [cap]);
      expect(permissionsGuard.canActivate(context)).toBe(true);
    }
  });

  // ---------------------------------------------------------------------------
  // Test 17: Extensibility without modifying guard code
  // ---------------------------------------------------------------------------
  it('17. A newly introduced role receives custom permissions via RolePermission without changing authorization guard code', () => {
    // Imagine a newly created role: AUDITOR with custom permission: "compliance.audit"
    const auditorUser: AuthenticatedUser = {
      id: 'auditor-1',
      email: 'auditor@test.com',
      name: 'Internal Auditor',
      roleId: 'role-auditor',
      roleName: 'AUDITOR',
      permissions: ['compliance.audit', 'reports.view'],
    };

    // The guard does not know what "AUDITOR" is, it only evaluates capabilities:
    const allowedContext = createMockContext(auditorUser, false, [
      'compliance.audit',
    ]);
    expect(permissionsGuard.canActivate(allowedContext)).toBe(true);

    // And denies capabilities the new role does not possess:
    const deniedContext = createMockContext(auditorUser, false, [
      'orders.override',
    ]);
    expect(() => permissionsGuard.canActivate(deniedContext)).toThrow(
      ForbiddenException,
    );
  });

  // ---------------------------------------------------------------------------
  // Phase 5 Authorization Tests (Items 27 to 30)
  // ---------------------------------------------------------------------------
  it('27. Admin can manage companies (has companies.manage)', () => {
    const adminUser: AuthenticatedUser = {
      id: 'admin-1',
      email: 'admin@test.com',
      name: 'Admin',
      roleId: 'role-admin',
      roleName: 'ADMIN',
      permissions: adminPermissions,
    };
    const ctx = createMockContext(adminUser, false, ['companies.manage']);
    expect(permissionsGuard.canActivate(ctx)).toBe(true);
  });

  it('28. Non-admin without companies.manage receives 403 Forbidden', () => {
    const driverUser: AuthenticatedUser = {
      id: 'driver-1',
      email: 'driver@test.com',
      name: 'Driver',
      roleId: 'role-driver',
      roleName: 'DRIVER',
      permissions: driverPermissions,
    };
    const ctx = createMockContext(driverUser, false, ['companies.manage']);
    expect(() => permissionsGuard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('29. Admin can manage employees (has employees.manage)', () => {
    const adminUser: AuthenticatedUser = {
      id: 'admin-1',
      email: 'admin@test.com',
      name: 'Admin',
      roleId: 'role-admin',
      roleName: 'ADMIN',
      permissions: adminPermissions,
    };
    const ctx = createMockContext(adminUser, false, ['employees.manage']);
    expect(permissionsGuard.canActivate(ctx)).toBe(true);
  });

  it('30. Unauthorized user receives 403 for employee management', () => {
    const kitchenUser: AuthenticatedUser = {
      id: 'kitchen-1',
      email: 'kitchen@test.com',
      name: 'Kitchen',
      roleId: 'role-kitchen',
      roleName: 'KITCHEN',
      permissions: kitchenPermissions,
    };
    const ctx = createMockContext(kitchenUser, false, ['employees.manage']);
    expect(() => permissionsGuard.canActivate(ctx)).toThrow(ForbiddenException);
  });
});
