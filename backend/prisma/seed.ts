import { PrismaClient, UserStatus, DayOfWeek } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

export const ALL_PERMISSIONS = [
  // Orders
  { key: 'orders.read', description: 'View order details and lists' },
  { key: 'orders.create', description: 'Create draft and placed orders' },
  { key: 'orders.update', description: 'Modify orders before cutoff' },
  { key: 'orders.cancel', description: 'Cancel orders before cutoff' },
  { key: 'orders.override', description: 'Admin override of order delivery, packaging, and address post-cutoff' },

  // Catalogue
  { key: 'catalogue.read', description: 'View dishes, options, groups, and portion sizes' },
  { key: 'catalogue.manage', description: 'Create, update, and deactivate catalogue dishes and options' },

  // Menu
  { key: 'menu.read', description: 'View menu categories and active items' },
  { key: 'menu.manage', description: 'Manage menu categories, items ordering, and secret categories' },

  // Pricing
  { key: 'pricing.read', description: 'View price tiers, dish prices, and option prices' },
  { key: 'pricing.manage', description: 'Create and edit price tiers, derivation rules, and price overrides' },

  // Companies
  { key: 'companies.read', description: 'View company profiles, calendars, and addresses' },
  { key: 'companies.manage', description: 'Create and update companies, domains, addresses, and calendars' },

  // Employees
  { key: 'employees.read', description: 'View company employees and dietary profiles' },
  { key: 'employees.manage', description: 'Create, update, move, and import employees' },

  // Kitchen
  { key: 'kitchen.read', description: 'View kitchen prep board and station units' },
  { key: 'kitchen.start', description: 'Mark prep units as started' },
  { key: 'kitchen.finish', description: 'Mark prep units as completed' },
  { key: 'kitchen.force_complete', description: 'Admin force-complete all prep units on an order' },

  // Dispatch
  { key: 'dispatch.read', description: 'View dispatch board and delivery drops' },
  { key: 'dispatch.assign_driver', description: 'Assign drivers to delivery drops' },
  { key: 'dispatch.update_status', description: 'Advance drop statuses (ready, out for delivery)' },

  // Driver
  { key: 'driver.read_own_deliveries', description: 'View assigned deliveries for today' },
  { key: 'driver.mark_delivered', description: 'Mark assigned drops delivered with note and photo' },

  // Billing
  { key: 'billing.read', description: 'View invoices and uninvoiced confirmed orders' },
  { key: 'billing.manage', description: 'Create invoices and mark invoices paid' },

  // Settings
  { key: 'settings.read', description: 'View kitchen operating days, holidays, and cutoff rules' },
  { key: 'settings.manage', description: 'Update platform cutoff time, day count, and calendars' },

  // Dashboards
  { key: 'dashboard.admin', description: 'Access administrator operational dashboard' },
  { key: 'dashboard.kitchen', description: 'Access kitchen prep overview dashboard' },
  { key: 'dashboard.dispatch', description: 'Access dispatch readiness dashboard' },
  { key: 'dashboard.driver', description: 'Access driver mobile dashboard' },

  // Users & Roles
  { key: 'users.read', description: 'View staff user accounts' },
  { key: 'users.manage', description: 'Create staff accounts and assign roles' },
  { key: 'roles.read', description: 'View roles and permission capabilities' },
  { key: 'roles.manage', description: 'Manage custom roles and permission mappings' },
];

export const ROLE_DEFINITIONS: Record<string, { description: string; permissions: string[] }> = {
  ADMIN: {
    description: 'Full system administrative access across all operational modules',
    permissions: ALL_PERMISSIONS.map((p) => p.key),
  },
  KITCHEN: {
    description: 'Commercial kitchen team managing preparation boards and station cooking units',
    permissions: [
      'kitchen.read',
      'kitchen.start',
      'kitchen.finish',
      'dashboard.kitchen',
      'orders.read',
      'catalogue.read',
    ],
  },
  DISPATCH: {
    description: 'Dispatch team managing delivery drops, driver assignments, and delivery tracking',
    permissions: [
      'dispatch.read',
      'dispatch.assign_driver',
      'dispatch.update_status',
      'dashboard.dispatch',
      'orders.read',
      'driver.read_own_deliveries',
    ],
  },
  DRIVER: {
    description: 'Delivery drivers accessing own current-day deliveries and submitting proof of delivery',
    permissions: [
      'driver.read_own_deliveries',
      'driver.mark_delivered',
      'dashboard.driver',
    ],
  },
};

export const SEEDED_ACCOUNTS = [
  {
    email: 'admin@test.com',
    password: 'Test@1234',
    name: 'Admin User',
    role: 'ADMIN',
  },
  {
    email: 'kitchen@test.com',
    password: 'Test@1234',
    name: 'Kitchen Lead',
    role: 'KITCHEN',
  },
  {
    email: 'dispatch@test.com',
    password: 'Test@1234',
    name: 'Dispatch Coordinator',
    role: 'DISPATCH',
  },
  {
    email: 'driver@test.com',
    password: 'Test@1234',
    name: 'Delivery Driver',
    role: 'DRIVER',
  },
];

export async function main() {
  console.log('🌱 Starting Fernleaf Kitchen database seed...');

  // 1. Seed Permissions
  console.log(`Seeding ${ALL_PERMISSIONS.length} permissions...`);
  const permissionMap = new Map<string, string>();
  for (const perm of ALL_PERMISSIONS) {
    const record = await prisma.permission.upsert({
      where: { key: perm.key },
      update: { description: perm.description },
      create: { key: perm.key, description: perm.description },
    });
    permissionMap.set(perm.key, record.id);
  }

  // 2. Seed Roles and RolePermissions
  console.log('Seeding roles and mapping permissions...');
  const roleMap = new Map<string, string>();
  for (const [roleName, def] of Object.entries(ROLE_DEFINITIONS)) {
    const roleRecord = await prisma.role.upsert({
      where: { name: roleName },
      update: { description: def.description },
      create: { name: roleName, description: def.description },
    });
    roleMap.set(roleName, roleRecord.id);

    // Map permissions
    for (const permKey of def.permissions) {
      const permissionId = permissionMap.get(permKey);
      if (permissionId) {
        await prisma.rolePermission.upsert({
          where: {
            roleId_permissionId: {
              roleId: roleRecord.id,
              permissionId,
            },
          },
          update: {},
          create: {
            roleId: roleRecord.id,
            permissionId,
          },
        });
      }
    }
  }

  // 3. Seed Required Accounts
  console.log('Seeding required accounts with bcrypt password hashes...');
  const passwordHash = await bcrypt.hash('Test@1234', 10);

  for (const account of SEEDED_ACCOUNTS) {
    const roleId = roleMap.get(account.role);
    if (!roleId) {
      throw new Error(`Role ${account.role} not found in roleMap`);
    }

    const user = await prisma.user.upsert({
      where: { email: account.email },
      update: {
        name: account.name,
        passwordHash,
        roleId,
        status: UserStatus.ACTIVE,
      },
      create: {
        email: account.email,
        name: account.name,
        passwordHash,
        roleId,
        status: UserStatus.ACTIVE,
      },
    });

    console.log(`  ✓ ${account.role}: ${user.email}`);
  }

  // 4. Seed Minimum Operational Reference Data
  console.log('Seeding kitchen operational settings & reference data...');
  await prisma.kitchenSetting.upsert({
    where: { id: 'default' },
    update: {
      cutoffTimeMinutes: 960, // 16:00
      cutoffWorkingDaysCount: 2,
      kitchenTimezone: 'Asia/Kolkata',
      dispatchBufferMinutes: 30,
      defaultPackagingBufferMinutes: 60,
    },
    create: {
      id: 'default',
      cutoffTimeMinutes: 960,
      cutoffWorkingDaysCount: 2,
      kitchenTimezone: 'Asia/Kolkata',
      dispatchBufferMinutes: 30,
      defaultPackagingBufferMinutes: 60,
    },
  });

  const weekDays: { day: DayOfWeek; isWorking: boolean }[] = [
    { day: DayOfWeek.MONDAY, isWorking: true },
    { day: DayOfWeek.TUESDAY, isWorking: true },
    { day: DayOfWeek.WEDNESDAY, isWorking: true },
    { day: DayOfWeek.THURSDAY, isWorking: true },
    { day: DayOfWeek.FRIDAY, isWorking: true },
    { day: DayOfWeek.SATURDAY, isWorking: false },
    { day: DayOfWeek.SUNDAY, isWorking: false },
  ];

  for (const wd of weekDays) {
    await prisma.kitchenWorkingDay.upsert({
      where: { dayOfWeek: wd.day },
      update: { isWorking: wd.isWorking },
      create: { dayOfWeek: wd.day, isWorking: wd.isWorking },
    });
  }

  // Default price tier
  await prisma.priceTier.upsert({
    where: { name: 'Standard' },
    update: { isDefault: true },
    create: {
      name: 'Standard',
      description: 'Default standard corporate pricing tier',
      isDefault: true,
    },
  });

  // Default packaging type
  await prisma.packagingType.upsert({
    where: { name: 'Standard Eco Box' },
    update: { isActive: true },
    create: {
      name: 'Standard Eco Box',
      isActive: true,
    },
  });

  console.log('✅ Seed completed successfully.');
}

if (require.main === module) {
  main()
    .catch((e) => {
      console.error('❌ Seed failed:', e);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
