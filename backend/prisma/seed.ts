import {
  PrismaClient,
  UserStatus,
  DayOfWeek,
  Temperature,
  OrderStatus,
  OrderEventType,
  KitchenUnitStatus,
  DropStatus,
  InvoiceStatus,
} from '@prisma/client';
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
  {
    email: 'driver2@test.com',
    password: 'Test@1234',
    name: 'Second Driver',
    role: 'DRIVER',
  },
];

function calculatePlannedTimings(
  deliveryDate: Date,
  deliveryTimeMinutes: number,
  deliveryMinutesBefore: number = 60,
) {
  const kolkataOffsetMs = 330 * 60 * 1000;
  const midnightUtcMs = deliveryDate.getTime() - kolkataOffsetMs;
  const deliveryUtcMs = midnightUtcMs + deliveryTimeMinutes * 60 * 1000;
  const plannedDispatchReadyAt = new Date(
    deliveryUtcMs - deliveryMinutesBefore * 60 * 1000,
  );
  const plannedKitchenReadyAt = new Date(
    plannedDispatchReadyAt.getTime() - 30 * 60 * 1000,
  );
  return { plannedDispatchReadyAt, plannedKitchenReadyAt };
}

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

  // Kitchen Holidays
  const kitchenHolidays = [
    { date: new Date('2026-05-01T00:00:00.000Z'), name: 'May Day (Kitchen Deep Clean)' },
    { date: new Date('2026-11-10T00:00:00.000Z'), name: 'Diwali Kitchen Holiday' },
  ];

  for (const kh of kitchenHolidays) {
    await prisma.kitchenHoliday.upsert({
      where: { date: kh.date },
      update: { name: kh.name },
      create: { date: kh.date, name: kh.name },
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

  // 5. Seed Additional Reference Data (Packaging, Allergens, Dietary Tags, Price Tiers)
  console.log('Seeding packaging, allergens, dietary tags, and pricing tiers...');

  // Packaging types
  const packagingTypes = [
    { name: 'Standard Eco Box' },
    { name: 'Premium Bento Pack' },
    { name: 'Biodegradable Meal Tray' },
  ];
  const pkgMap = new Map<string, string>();
  for (const pkg of packagingTypes) {
    const p = await prisma.packagingType.upsert({
      where: { name: pkg.name },
      update: { isActive: true },
      create: { name: pkg.name, isActive: true },
    });
    pkgMap.set(pkg.name, p.id);
  }

  // Allergens
  const allergenNames = [
    'Peanuts',
    'Gluten',
    'Dairy',
    'Soy',
    'Shellfish',
    'Tree Nuts',
  ];
  const allergenMap = new Map<string, string>();
  for (const name of allergenNames) {
    const a = await prisma.allergen.upsert({
      where: { name },
      update: { isActive: true },
      create: { name, isActive: true },
    });
    allergenMap.set(name, a.id);
  }

  // Dietary Tags
  const dietaryTagNames = [
    'Vegetarian',
    'Vegan',
    'Jain',
    'Gluten-Free',
    'High-Protein',
  ];
  const dietaryTagMap = new Map<string, string>();
  for (const name of dietaryTagNames) {
    const dt = await prisma.dietaryTag.upsert({
      where: { name },
      update: { isActive: true },
      create: { name, isActive: true },
    });
    dietaryTagMap.set(name, dt.id);
  }

  // Price Tiers
  const priceTiers = [
    {
      name: 'Standard',
      description: 'Default standard corporate pricing tier',
      isDefault: true,
    },
    {
      name: 'Enterprise Gold',
      description: 'Volume-discounted tier for large enterprises',
      isDefault: false,
    },
    {
      name: 'Startup Advantage',
      description: 'Flexible tier for growing technology startups',
      isDefault: false,
    },
  ];
  const priceTierMap = new Map<string, string>();
  for (const pt of priceTiers) {
    const tier = await prisma.priceTier.upsert({
      where: { name: pt.name },
      update: { description: pt.description, isDefault: pt.isDefault },
      create: {
        name: pt.name,
        description: pt.description,
        isDefault: pt.isDefault,
      },
    });
    priceTierMap.set(pt.name, tier.id);
  }

  // Sample Dishes & Categories for testing menu visibility integration
  const catThali = await prisma.menuCategory.upsert({
    where: { id: 'seed-cat-executive-thali' },
    update: { name: 'Executive Thali', displayOrder: 1, isActive: true },
    create: {
      id: 'seed-cat-executive-thali',
      name: 'Executive Thali',
      displayOrder: 1,
      isActive: true,
    },
  });
  const catBowls = await prisma.menuCategory.upsert({
    where: { id: 'seed-cat-bowls-salads' },
    update: { name: 'Bowls & Salads', displayOrder: 2, isActive: true },
    create: {
      id: 'seed-cat-bowls-salads',
      name: 'Bowls & Salads',
      displayOrder: 2,
      isActive: true,
    },
  });

  // 5a. Kitchen Stations
  console.log('Seeding kitchen stations...');
  const stationCold = await prisma.kitchenStation.upsert({
    where: { name: 'Cold Prep & Salads' },
    update: { isActive: true },
    create: { name: 'Cold Prep & Salads', isActive: true },
  });
  const stationHot = await prisma.kitchenStation.upsert({
    where: { name: 'Hot Line' },
    update: { isActive: true },
    create: { name: 'Hot Line', isActive: true },
  });
  const stationBakery = await prisma.kitchenStation.upsert({
    where: { name: 'Bakery & Desserts' },
    update: { isActive: true },
    create: { name: 'Bakery & Desserts', isActive: true },
  });

  const dishSalad = await prisma.dish.upsert({
    where: { sku: 'SKU-SMK-SALAD' },
    update: {
      name: 'Smoked Chicken Salad',
      temperature: Temperature.COLD,
      costPriceCents: 450,
      kitchenStationId: stationCold.id,
      isActive: true,
    },
    create: {
      sku: 'SKU-SMK-SALAD',
      name: 'Smoked Chicken Salad',
      description: 'Oak-smoked chicken breast over dressed microgreens',
      temperature: Temperature.COLD,
      costPriceCents: 450,
      kitchenStationId: stationCold.id,
      isActive: true,
    },
  });

  const dishBowl = await prisma.dish.upsert({
    where: { sku: 'SKU-PNR-BOWL' },
    update: {
      name: 'Paneer Tikka Meal Bowl',
      temperature: Temperature.HOT,
      costPriceCents: 380,
      kitchenStationId: stationHot.id,
      isActive: true,
    },
    create: {
      sku: 'SKU-PNR-BOWL',
      name: 'Paneer Tikka Meal Bowl',
      description:
        'Char-grilled cottage cheese cubes with cumin brown rice and mint chutney',
      temperature: Temperature.HOT,
      costPriceCents: 380,
      kitchenStationId: stationHot.id,
      isActive: true,
    },
  });

  const dishBrownie = await prisma.dish.upsert({
    where: { sku: 'SKU-FUDGE-BRW' },
    update: {
      name: 'Warm Fudge Brownie',
      temperature: Temperature.COLD,
      costPriceCents: 150,
      kitchenStationId: null, // explicitly Unassigned station
      isActive: true,
    },
    create: {
      sku: 'SKU-FUDGE-BRW',
      name: 'Warm Fudge Brownie',
      description: 'Decadent dark chocolate fudge brownie square',
      temperature: Temperature.COLD,
      costPriceCents: 150,
      kitchenStationId: null,
      isActive: true,
    },
  });

  // Link dishes to categories
  await prisma.menuCategoryDish.upsert({
    where: {
      categoryId_dishId: { categoryId: catBowls.id, dishId: dishSalad.id },
    },
    update: { displayOrder: 1 },
    create: { categoryId: catBowls.id, dishId: dishSalad.id, displayOrder: 1 },
  });
  await prisma.menuCategoryDish.upsert({
    where: {
      categoryId_dishId: { categoryId: catThali.id, dishId: dishBowl.id },
    },
    update: { displayOrder: 1 },
    create: { categoryId: catThali.id, dishId: dishBowl.id, displayOrder: 1 },
  });
  await prisma.menuCategoryDish.upsert({
    where: {
      categoryId_dishId: { categoryId: catBowls.id, dishId: dishBrownie.id },
    },
    update: { displayOrder: 2 },
    create: { categoryId: catBowls.id, dishId: dishBrownie.id, displayOrder: 2 },
  });

  // 5b. Seed Portion Sizes, Option Groups, Options & Prices
  console.log('Seeding portion sizes, option groups, options, and prices...');
  const portionRegular = await prisma.portionSize.upsert({
    where: { name: 'Regular' },
    update: { displayOrder: 1, isActive: true },
    create: { name: 'Regular', displayOrder: 1, isActive: true },
  });
  const portionLarge = await prisma.portionSize.upsert({
    where: { name: 'Large' },
    update: { displayOrder: 2, isActive: true },
    create: { name: 'Large', displayOrder: 2, isActive: true },
  });

  // Option Group: Dressing Choice (Required, no portions) for Salad
  const groupDressing = await prisma.optionGroup.upsert({
    where: { id: 'seed-og-dressing' },
    update: { name: 'Dressing Choice', isRequired: true, usesPortions: false, isActive: true },
    create: { id: 'seed-og-dressing', name: 'Dressing Choice', isRequired: true, usesPortions: false, isActive: true },
  });
  await prisma.dishOptionGroup.upsert({
    where: { dishId_optionGroupId: { dishId: dishSalad.id, optionGroupId: groupDressing.id } },
    update: { displayOrder: 1 },
    create: { dishId: dishSalad.id, optionGroupId: groupDressing.id, displayOrder: 1 },
  });

  // Options for Dressing
  const optHoneyMustard = await prisma.option.upsert({
    where: { id: 'seed-opt-honey-mustard' },
    update: { name: 'Honey Mustard', costPriceCents: 40, isActive: true },
    create: { id: 'seed-opt-honey-mustard', name: 'Honey Mustard', costPriceCents: 40, isActive: true },
  });
  const optOliveOil = await prisma.option.upsert({
    where: { id: 'seed-opt-olive-oil' },
    update: { name: 'Olive Oil & Lemon', costPriceCents: 35, isActive: true },
    create: { id: 'seed-opt-olive-oil', name: 'Olive Oil & Lemon', costPriceCents: 35, isActive: true },
  });
  await prisma.optionGroupOption.upsert({
    where: { optionGroupId_optionId: { optionGroupId: groupDressing.id, optionId: optHoneyMustard.id } },
    update: { displayOrder: 1 },
    create: { optionGroupId: groupDressing.id, optionId: optHoneyMustard.id, displayOrder: 1 },
  });
  await prisma.optionGroupOption.upsert({
    where: { optionGroupId_optionId: { optionGroupId: groupDressing.id, optionId: optOliveOil.id } },
    update: { displayOrder: 2 },
    create: { optionGroupId: groupDressing.id, optionId: optOliveOil.id, displayOrder: 2 },
  });

  // Option Group: Meal Portion & Addon (Optional, uses portions) for Bowl
  const groupBowlAddon = await prisma.optionGroup.upsert({
    where: { id: 'seed-og-bowl-addon' },
    update: { name: 'Meal Portion & Addon', isRequired: false, usesPortions: true, isActive: true },
    create: { id: 'seed-og-bowl-addon', name: 'Meal Portion & Addon', isRequired: false, usesPortions: true, isActive: true },
  });
  await prisma.dishOptionGroup.upsert({
    where: { dishId_optionGroupId: { dishId: dishBowl.id, optionGroupId: groupBowlAddon.id } },
    update: { displayOrder: 1 },
    create: { dishId: dishBowl.id, optionGroupId: groupBowlAddon.id, displayOrder: 1 },
  });
  await prisma.optionGroupPortion.upsert({
    where: { optionGroupId_portionSizeId: { optionGroupId: groupBowlAddon.id, portionSizeId: portionRegular.id } },
    update: { displayOrder: 1, extraPriceCents: 0 },
    create: { optionGroupId: groupBowlAddon.id, portionSizeId: portionRegular.id, displayOrder: 1, extraPriceCents: 0 },
  });
  await prisma.optionGroupPortion.upsert({
    where: { optionGroupId_portionSizeId: { optionGroupId: groupBowlAddon.id, portionSizeId: portionLarge.id } },
    update: { displayOrder: 2, extraPriceCents: 100 },
    create: { optionGroupId: groupBowlAddon.id, portionSizeId: portionLarge.id, displayOrder: 2, extraPriceCents: 100 },
  });

  // Options for Bowl Addon
  const optExtraPaneer = await prisma.option.upsert({
    where: { id: 'seed-opt-extra-paneer' },
    update: { name: 'Extra Roasted Paneer', costPriceCents: 60, isActive: true },
    create: { id: 'seed-opt-extra-paneer', name: 'Extra Roasted Paneer', costPriceCents: 60, isActive: true },
  });
  const optAvocado = await prisma.option.upsert({
    where: { id: 'seed-opt-avocado' },
    update: { name: 'Avocado Salsa', costPriceCents: 75, isActive: true },
    create: { id: 'seed-opt-avocado', name: 'Avocado Salsa', costPriceCents: 75, isActive: true },
  });
  await prisma.optionGroupOption.upsert({
    where: { optionGroupId_optionId: { optionGroupId: groupBowlAddon.id, optionId: optExtraPaneer.id } },
    update: { displayOrder: 1 },
    create: { optionGroupId: groupBowlAddon.id, optionId: optExtraPaneer.id, displayOrder: 1 },
  });
  await prisma.optionGroupOption.upsert({
    where: { optionGroupId_optionId: { optionGroupId: groupBowlAddon.id, optionId: optAvocado.id } },
    update: { displayOrder: 2 },
    create: { optionGroupId: groupBowlAddon.id, optionId: optAvocado.id, displayOrder: 2 },
  });

  // Prices across tiers
  for (const [tierName, tierId] of priceTierMap.entries()) {
    if (!tierId) continue;
    const isGold = tierName === 'Enterprise Gold';
    const isStartup = tierName === 'Startup Advantage';

    // Salad price: standard 850, gold 750, startup 800
    const saladPrice = isGold ? 750 : isStartup ? 800 : 850;
    await prisma.dishPrice.upsert({
      where: { dishId_priceTierId: { dishId: dishSalad.id, priceTierId: tierId } },
      update: { priceCents: saladPrice },
      create: { dishId: dishSalad.id, priceTierId: tierId, priceCents: saladPrice },
    });

    // Bowl price: standard 950, gold 850, startup 900
    const bowlPrice = isGold ? 850 : isStartup ? 900 : 950;
    await prisma.dishPrice.upsert({
      where: { dishId_priceTierId: { dishId: dishBowl.id, priceTierId: tierId } },
      update: { priceCents: bowlPrice },
      create: { dishId: dishBowl.id, priceTierId: tierId, priceCents: bowlPrice },
    });

    // Brownie price: standard 250, gold 200, startup 220
    const browniePrice = isGold ? 200 : isStartup ? 220 : 250;
    await prisma.dishPrice.upsert({
      where: { dishId_priceTierId: { dishId: dishBrownie.id, priceTierId: tierId } },
      update: { priceCents: browniePrice },
      create: { dishId: dishBrownie.id, priceTierId: tierId, priceCents: browniePrice },
    });

    // Option prices
    await prisma.optionPrice.upsert({
      where: { optionId_priceTierId: { optionId: optHoneyMustard.id, priceTierId: tierId } },
      update: { priceCents: isGold ? 40 : isStartup ? 45 : 50 },
      create: { optionId: optHoneyMustard.id, priceTierId: tierId, priceCents: isGold ? 40 : isStartup ? 45 : 50 },
    });
    await prisma.optionPrice.upsert({
      where: { optionId_priceTierId: { optionId: optOliveOil.id, priceTierId: tierId } },
      update: { priceCents: isGold ? 30 : isStartup ? 35 : 40 },
      create: { optionId: optOliveOil.id, priceTierId: tierId, priceCents: isGold ? 30 : isStartup ? 35 : 40 },
    });
    await prisma.optionPrice.upsert({
      where: { optionId_priceTierId: { optionId: optExtraPaneer.id, priceTierId: tierId } },
      update: { priceCents: isGold ? 130 : isStartup ? 140 : 150 },
      create: { optionId: optExtraPaneer.id, priceTierId: tierId, priceCents: isGold ? 130 : isStartup ? 140 : 150 },
    });
    await prisma.optionPrice.upsert({
      where: { optionId_priceTierId: { optionId: optAvocado.id, priceTierId: tierId } },
      update: { priceCents: isGold ? 160 : isStartup ? 170 : 180 },
      create: { optionId: optAvocado.id, priceTierId: tierId, priceCents: isGold ? 160 : isStartup ? 170 : 180 },
    });
  }

  // 6. Find Driver User
  const driverUser = await prisma.user.findUnique({
    where: { email: 'driver@test.com' },
  });
  if (!driverUser) {
    throw new Error('Default driver user driver@test.com not found');
  }

  // 7. Seed Realistic Companies
  console.log('Seeding realistic corporate clients, addresses, and calendars...');
  const companiesSeedData = [
    {
      key: 'apex',
      name: 'Apex Technologies Ltd',
      domains: ['apextech.io', 'apexcorp.com'],
      priceTierId: priceTierMap.get('Enterprise Gold'),
      billingContactName: 'Rajesh Sharma',
      billingContactEmail: 'billing@apextech.io',
      billingContactPhone: '+91-9880011223',
      defaultDeliveryTimeMinutes: 750, // 12:30 PM
      deliveryMinutesBefore: 45,
      defaultPackagingTypeId: pkgMap.get('Standard Eco Box')!,
      defaultDriverId: driverUser.id,
      driverInstructions:
        'Security checkpoint at Gate 2. Driver badge check required. Use freight elevator to 4th floor reception.',
      addresses: [
        {
          label: 'Apex Tower HQ',
          addressLine1: 'Level 4, Embassy Tech Village, Outer Ring Road',
          addressLine2: 'Devarabisanahalli',
          city: 'Bangalore',
          state: 'Karnataka',
          postalCode: '560103',
        },
        {
          label: 'Apex Whitefield Campus',
          addressLine1: 'Building B, ITPL Main Road',
          addressLine2: 'Whitefield',
          city: 'Bangalore',
          state: 'Karnataka',
          postalCode: '560066',
        },
      ],
      holidays: [
        { date: new Date('2026-01-26T00:00:00.000Z'), name: 'Republic Day' },
        { date: new Date('2026-08-15T00:00:00.000Z'), name: 'Independence Day' },
      ],
      hiddenCategoryIds: [] as string[],
      hiddenDishIds: [] as string[],
    },
    {
      key: 'summit',
      name: 'Summit Health Innovations',
      domains: ['summithealth.co'],
      priceTierId: priceTierMap.get('Standard'),
      billingContactName: 'Dr. Ananya Rao',
      billingContactEmail: 'accounts@summithealth.co',
      billingContactPhone: '+91-9900055443',
      defaultDeliveryTimeMinutes: 780, // 1:00 PM
      deliveryMinutesBefore: 60,
      defaultPackagingTypeId: pkgMap.get('Premium Bento Pack')!,
      defaultDriverId: null,
      driverInstructions:
        'Reception desk at main atrium. Leave on catering console.',
      addresses: [
        {
          label: 'Summit Innovation Centre',
          addressLine1: 'Plot 12, Electronic City Phase 1',
          addressLine2: 'Hosur Road',
          city: 'Bangalore',
          state: 'Karnataka',
          postalCode: '560100',
        },
      ],
      holidays: [
        { date: new Date('2026-10-02T00:00:00.000Z'), name: 'Gandhi Jayanti' },
      ],
      hiddenCategoryIds: [] as string[],
      hiddenDishIds: [dishSalad.id], // Smoked Chicken Salad hidden for Summit Health
    },
    {
      key: 'verdant',
      name: 'Verdant BioSystems',
      domains: ['verdantbio.in'],
      priceTierId: priceTierMap.get('Startup Advantage'),
      billingContactName: 'Siddharth Menon',
      billingContactEmail: 'finance@verdantbio.in',
      billingContactPhone: '+91-9876543210',
      defaultDeliveryTimeMinutes: 720, // 12:00 PM
      deliveryMinutesBefore: 30,
      defaultPackagingTypeId: pkgMap.get('Biodegradable Meal Tray')!,
      defaultDriverId: null,
      driverInstructions:
        'Cold storage drop-off point behind Cafeteria 2.',
      addresses: [
        {
          label: 'Verdant Lab Facilities',
          addressLine1: 'Tower 3, Bagmane Tech Park, CV Raman Nagar',
          addressLine2: null,
          city: 'Bangalore',
          state: 'Karnataka',
          postalCode: '560093',
        },
        {
          label: 'Verdant Shared Campus Hub',
          addressLine1: 'Plot 12, Electronic City Phase 1',
          addressLine2: 'Hosur Road',
          city: 'Bangalore',
          state: 'Karnataka',
          postalCode: '560100',
        },
      ],
      holidays: [
        { date: new Date('2026-05-01T00:00:00.000Z'), name: 'May Day' },
      ],
      hiddenCategoryIds: [catThali.id], // Executive Thali hidden for Verdant
      hiddenDishIds: [] as string[],
    },
  ];

  const seededCompaniesMap = new Map<string, any>();
  const seededAddressesMap = new Map<string, any>();

  for (const cData of companiesSeedData) {
    let company = await prisma.company.findFirst({
      where: { name: cData.name },
    });

    if (!company) {
      company = await prisma.company.create({
        data: {
          name: cData.name,
          priceTierId: cData.priceTierId,
          billingContactName: cData.billingContactName,
          billingContactEmail: cData.billingContactEmail,
          billingContactPhone: cData.billingContactPhone,
          defaultDeliveryTimeMinutes: cData.defaultDeliveryTimeMinutes,
          deliveryMinutesBefore: cData.deliveryMinutesBefore,
          defaultPackagingTypeId: cData.defaultPackagingTypeId,
          defaultDriverId: cData.defaultDriverId,
          driverInstructions: cData.driverInstructions,
        },
      });
    } else {
      company = await prisma.company.update({
        where: { id: company.id },
        data: {
          priceTierId: cData.priceTierId,
          billingContactName: cData.billingContactName,
          billingContactEmail: cData.billingContactEmail,
          billingContactPhone: cData.billingContactPhone,
          defaultDeliveryTimeMinutes: cData.defaultDeliveryTimeMinutes,
          deliveryMinutesBefore: cData.deliveryMinutesBefore,
          defaultPackagingTypeId: cData.defaultPackagingTypeId,
          defaultDriverId: cData.defaultDriverId,
          driverInstructions: cData.driverInstructions,
        },
      });
    }
    seededCompaniesMap.set(cData.key, company);

    // Domains
    for (const d of cData.domains) {
      await prisma.companyDomain.upsert({
        where: { domain: d },
        update: { companyId: company.id },
        create: { domain: d, companyId: company.id },
      });
    }

    // Addresses
    for (const addr of cData.addresses) {
      let existingAddr = await prisma.companyAddress.findFirst({
        where: { companyId: company.id, label: addr.label },
      });
      if (!existingAddr) {
        existingAddr = await prisma.companyAddress.create({
          data: {
            companyId: company.id,
            label: addr.label,
            addressLine1: addr.addressLine1,
            addressLine2: addr.addressLine2,
            city: addr.city,
            state: addr.state,
            postalCode: addr.postalCode,
            isActive: true,
          },
        });
      }
      seededAddressesMap.set(addr.label, existingAddr);
    }

    // Working Days (Mon-Fri working, Sat-Sun non-working)
    for (const wd of weekDays) {
      await prisma.companyWorkingDay.upsert({
        where: {
          companyId_dayOfWeek: {
            companyId: company.id,
            dayOfWeek: wd.day,
          },
        },
        update: { isWorking: wd.isWorking },
        create: {
          companyId: company.id,
          dayOfWeek: wd.day,
          isWorking: wd.isWorking,
        },
      });
    }

    // Holidays
    for (const h of cData.holidays) {
      await prisma.companyHoliday.upsert({
        where: {
          companyId_date: {
            companyId: company.id,
            date: h.date,
          },
        },
        update: { name: h.name },
        create: {
          companyId: company.id,
          date: h.date,
          name: h.name,
        },
      });
    }

    // Menu Visibility
    for (const catId of cData.hiddenCategoryIds) {
      await prisma.companyHiddenCategory.upsert({
        where: {
          companyId_categoryId: {
            companyId: company.id,
            categoryId: catId,
          },
        },
        update: {},
        create: {
          companyId: company.id,
          categoryId: catId,
        },
      });
    }

    for (const dId of cData.hiddenDishIds) {
      await prisma.companyHiddenDish.upsert({
        where: {
          companyId_dishId: {
            companyId: company.id,
            dishId: dId,
          },
        },
        update: {},
        create: {
          companyId: company.id,
          dishId: dId,
        },
      });
    }
    console.log(`  ✓ Company: ${company.name}`);
  }

  // 8. Seed Employees
  console.log('Seeding employees with dietary preferences and address choices...');
  const apexComp = seededCompaniesMap.get('apex');
  const summitComp = seededCompaniesMap.get('summit');
  const verdantComp = seededCompaniesMap.get('verdant');

  const employeesSeedData = [
    // Apex employees
    {
      companyId: apexComp.id,
      firstName: 'Rajesh',
      lastName: 'Sharma',
      email: 'rajesh.sharma@apextech.io',
      phone: '+91-9880011223',
      isOwner: true,
      canChooseDeliveryAddress: true,
      canChangeDeliveryTime: true,
      canChangePackaging: true,
      defaultDeliveryAddressLabel: 'Apex Tower HQ',
      defaultDeliveryTimeMinutes: 750,
      defaultPackagingName: 'Standard Eco Box',
      allergens: [] as string[],
      dietaryTags: ['Vegetarian'],
    },
    {
      companyId: apexComp.id,
      firstName: 'Priya',
      lastName: 'Patel',
      email: 'priya.patel@apextech.io',
      phone: '+91-9880022334',
      isOwner: false,
      canChooseDeliveryAddress: true,
      canChangeDeliveryTime: false,
      canChangePackaging: false,
      defaultDeliveryAddressLabel: 'Apex Tower HQ',
      defaultDeliveryTimeMinutes: null as number | null,
      defaultPackagingName: null as string | null,
      allergens: ['Peanuts'],
      dietaryTags: ['Vegetarian', 'High-Protein'],
    },
    {
      companyId: apexComp.id,
      firstName: 'Amit',
      lastName: 'Verma',
      email: 'amit.verma@apextech.io',
      phone: '+91-9880033445',
      isOwner: false,
      canChooseDeliveryAddress: false,
      canChangeDeliveryTime: false,
      canChangePackaging: false,
      defaultDeliveryAddressLabel: 'Apex Whitefield Campus',
      defaultDeliveryTimeMinutes: null as number | null,
      defaultPackagingName: null as string | null,
      allergens: [] as string[],
      dietaryTags: ['Jain'],
    },

    // Summit employees
    {
      companyId: summitComp.id,
      firstName: 'Ananya',
      lastName: 'Rao',
      email: 'ananya.rao@summithealth.co',
      phone: '+91-9900055443',
      isOwner: true,
      canChooseDeliveryAddress: true,
      canChangeDeliveryTime: true,
      canChangePackaging: true,
      defaultDeliveryAddressLabel: 'Summit Innovation Centre',
      defaultDeliveryTimeMinutes: 780,
      defaultPackagingName: 'Premium Bento Pack',
      allergens: [] as string[],
      dietaryTags: [] as string[],
    },
    {
      companyId: summitComp.id,
      firstName: 'Vikram',
      lastName: 'Nair',
      email: 'vikram.nair@summithealth.co',
      phone: '+91-9900066554',
      isOwner: false,
      canChooseDeliveryAddress: false,
      canChangeDeliveryTime: false,
      canChangePackaging: false,
      defaultDeliveryAddressLabel: 'Summit Innovation Centre',
      defaultDeliveryTimeMinutes: null as number | null,
      defaultPackagingName: null as string | null,
      allergens: ['Gluten', 'Dairy'],
      dietaryTags: ['Gluten-Free'],
    },

    // Verdant employees
    {
      companyId: verdantComp.id,
      firstName: 'Siddharth',
      lastName: 'Menon',
      email: 'siddharth.menon@verdantbio.in',
      phone: '+91-9876543210',
      isOwner: true,
      canChooseDeliveryAddress: true,
      canChangeDeliveryTime: true,
      canChangePackaging: false,
      defaultDeliveryAddressLabel: 'Verdant Lab Facilities',
      defaultDeliveryTimeMinutes: 720,
      defaultPackagingName: 'Biodegradable Meal Tray',
      allergens: [] as string[],
      dietaryTags: ['Vegan'],
    },
    {
      companyId: verdantComp.id,
      firstName: 'Neha',
      lastName: 'Gupta',
      email: 'neha.gupta@verdantbio.in',
      phone: '+91-9876543211',
      isOwner: false,
      canChooseDeliveryAddress: false,
      canChangeDeliveryTime: false,
      canChangePackaging: false,
      defaultDeliveryAddressLabel: 'Verdant Lab Facilities',
      defaultDeliveryTimeMinutes: null as number | null,
      defaultPackagingName: null as string | null,
      allergens: ['Soy'],
      dietaryTags: [] as string[],
    },
  ];

  for (const empData of employeesSeedData) {
    const addr = empData.defaultDeliveryAddressLabel
      ? seededAddressesMap.get(empData.defaultDeliveryAddressLabel)
      : null;
    const pkgId = empData.defaultPackagingName
      ? pkgMap.get(empData.defaultPackagingName)
      : null;

    const employee = await prisma.employee.upsert({
      where: { email: empData.email },
      update: {
        companyId: empData.companyId,
        firstName: empData.firstName,
        lastName: empData.lastName,
        phone: empData.phone,
        canChooseDeliveryAddress: empData.canChooseDeliveryAddress,
        canChangeDeliveryTime: empData.canChangeDeliveryTime,
        canChangePackaging: empData.canChangePackaging,
        defaultDeliveryAddressId: addr ? addr.id : null,
        defaultDeliveryTimeMinutes: empData.defaultDeliveryTimeMinutes,
        defaultPackagingTypeId: pkgId || null,
        isActive: true,
      },
      create: {
        companyId: empData.companyId,
        firstName: empData.firstName,
        lastName: empData.lastName,
        email: empData.email,
        phone: empData.phone,
        canChooseDeliveryAddress: empData.canChooseDeliveryAddress,
        canChangeDeliveryTime: empData.canChangeDeliveryTime,
        canChangePackaging: empData.canChangePackaging,
        defaultDeliveryAddressId: addr ? addr.id : null,
        defaultDeliveryTimeMinutes: empData.defaultDeliveryTimeMinutes,
        defaultPackagingTypeId: pkgId || null,
        isActive: true,
      },
    });

    // If owner, set on company
    if (empData.isOwner) {
      await prisma.company.update({
        where: { id: empData.companyId },
        data: { ownerEmployeeId: employee.id },
      });
    }

    // Allergens
    for (const aName of empData.allergens) {
      const aId = allergenMap.get(aName);
      if (aId) {
        await prisma.employeeAllergen.upsert({
          where: {
            employeeId_allergenId: {
              employeeId: employee.id,
              allergenId: aId,
            },
          },
          update: {},
          create: {
            employeeId: employee.id,
            allergenId: aId,
          },
        });
      }
    }

    // Dietary tags
    for (const dtName of empData.dietaryTags) {
      const dtId = dietaryTagMap.get(dtName);
      if (dtId) {
        await prisma.employeeDietaryTag.upsert({
          where: {
            employeeId_dietaryTagId: {
              employeeId: employee.id,
              dietaryTagId: dtId,
            },
          },
          update: {},
          create: {
            employeeId: employee.id,
            dietaryTagId: dtId,
          },
        });
      }
    }
    console.log(
      `  ✓ Employee: ${employee.firstName} ${employee.lastName} (${employee.email})`,
    );
  }

  // 9. Seed Realistic Orders in all relevant statuses
  console.log('Seeding realistic orders across statuses, companies, and dates...');

  const empRajesh = await prisma.employee.findUnique({ where: { email: 'rajesh.sharma@apextech.io' } });
  const empPriya = await prisma.employee.findUnique({ where: { email: 'priya.patel@apextech.io' } });
  const empAnanya = await prisma.employee.findUnique({ where: { email: 'ananya.rao@summithealth.co' } });
  const empVikram = await prisma.employee.findUnique({ where: { email: 'vikram.nair@summithealth.co' } });
  const empSiddharth = await prisma.employee.findUnique({ where: { email: 'siddharth.menon@verdantbio.in' } });

  const addrApexHQ = seededAddressesMap.get('Apex Tower HQ');
  const addrApexWhitefield = seededAddressesMap.get('Apex Whitefield Campus');
  const addrSummit = seededAddressesMap.get('Summit Innovation Centre');
  const addrVerdant = seededAddressesMap.get('Verdant Lab Facilities');
  const addrVerdantHub = seededAddressesMap.get('Verdant Shared Campus Hub');

  const pkgEco = pkgMap.get('Standard Eco Box')!;
  const pkgBento = pkgMap.get('Premium Bento Pack')!;
  const pkgBio = pkgMap.get('Biodegradable Meal Tray')!;

  // Dynamic Kolkata today calendar date
  const todayKolkataStr = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  const [ty, tm, td] = todayKolkataStr.split('-').map(Number);
  const todayKolkataDate = new Date(Date.UTC(ty, tm - 1, td, 0, 0, 0, 0));

  const timingsK001 = calculatePlannedTimings(todayKolkataDate, 720, apexComp.deliveryMinutesBefore ?? 60);
  const timingsK002 = calculatePlannedTimings(todayKolkataDate, 780, summitComp.deliveryMinutesBefore ?? 45);
  const timingsK003 = calculatePlannedTimings(todayKolkataDate, 1110, verdantComp.deliveryMinutesBefore ?? 60);
  const timings0002 = calculatePlannedTimings(new Date('2026-10-06T00:00:00.000Z'), 750, apexComp.deliveryMinutesBefore ?? 60);
  const timings0007 = calculatePlannedTimings(new Date('2026-10-06T00:00:00.000Z'), 750, apexComp.deliveryMinutesBefore ?? 60);

  const timingsD001 = calculatePlannedTimings(todayKolkataDate, 700, apexComp.deliveryMinutesBefore ?? 45);
  const timingsD002 = calculatePlannedTimings(todayKolkataDate, 700, apexComp.deliveryMinutesBefore ?? 45);
  const timingsD003 = calculatePlannedTimings(todayKolkataDate, 840, apexComp.deliveryMinutesBefore ?? 45);
  const timingsD004 = calculatePlannedTimings(todayKolkataDate, 840, summitComp.deliveryMinutesBefore ?? 60);
  const timingsD005 = calculatePlannedTimings(todayKolkataDate, 840, verdantComp.deliveryMinutesBefore ?? 30);

  const seedOrders = [
    // 1. DELIVERED order in the past (Apex)
    {
      orderNumber: 'FK-2026-0001',
      employeeId: empRajesh!.id,
      companyId: apexComp.id,
      deliveryDate: new Date('2026-09-24T00:00:00.000Z'),
      deliveryTimeMinutes: 750,
      packagingTypeId: pkgEco,
      status: OrderStatus.DELIVERED,
      totalCents: 1580,
      placedAt: new Date('2026-09-21T10:00:00.000Z'),
      confirmedAt: new Date('2026-09-22T16:00:00.000Z'),
      deliveredAt: new Date('2026-09-24T12:35:00.000Z'),
      delivery: {
        companyAddressId: addrApexHQ.id,
        addressLabelSnapshot: addrApexHQ.label,
        addressLine1Snapshot: addrApexHQ.addressLine1,
        addressLine2Snapshot: addrApexHQ.addressLine2,
        citySnapshot: addrApexHQ.city,
        stateSnapshot: addrApexHQ.state,
        postalCodeSnapshot: addrApexHQ.postalCode,
        deliveryTimeMinutes: 750,
        packagingNameSnapshot: 'Standard Eco Box',
        deliveryInstructionsSnapshot: apexComp.driverInstructions,
      },
      lines: [
        {
          dishId: dishSalad.id,
          dishNameSnapshot: dishSalad.name,
          dishSkuSnapshot: dishSalad.sku,
          dishUnitPriceCents: 750,
          quantity: 2,
          lineTotalCents: 1580,
          combinations: [
            {
              quantity: 2,
              unitPriceCents: 790,
              combinationTotalCents: 1580,
              options: [
                {
                  optionId: optHoneyMustard.id,
                  optionGroupId: groupDressing.id,
                  optionGroupNameSnapshot: groupDressing.name,
                  optionNameSnapshot: optHoneyMustard.name,
                  optionPriceCents: 40,
                  portionSizeId: null,
                  portionNameSnapshot: null,
                  portionExtraCents: 0,
                },
              ],
            },
          ],
        },
      ],
      events: [
        { type: OrderEventType.ORDER_CREATED, createdAt: new Date('2026-09-21T09:30:00.000Z') },
        { type: OrderEventType.ORDER_PLACED, createdAt: new Date('2026-09-21T10:00:00.000Z') },
        { type: OrderEventType.ORDER_CONFIRMED, createdAt: new Date('2026-09-22T16:00:00.000Z') },
        { type: OrderEventType.DELIVERED, createdAt: new Date('2026-09-24T12:35:00.000Z') },
      ],
    },
    // 2. CONFIRMED order (Apex) - multi-combination
    {
      orderNumber: 'FK-2026-0002',
      employeeId: empRajesh!.id,
      companyId: apexComp.id,
      deliveryDate: new Date('2026-10-06T00:00:00.000Z'),
      deliveryTimeMinutes: 750,
      packagingTypeId: pkgEco,
      status: OrderStatus.CONFIRMED,
      totalCents: 2810,
      placedAt: new Date('2026-10-01T11:00:00.000Z'),
      confirmedAt: new Date('2026-10-02T16:00:00.000Z'),
      plannedDispatchReadyAt: timings0002.plannedDispatchReadyAt,
      plannedKitchenReadyAt: timings0002.plannedKitchenReadyAt,
      delivery: {
        companyAddressId: addrApexHQ.id,
        addressLabelSnapshot: addrApexHQ.label,
        addressLine1Snapshot: addrApexHQ.addressLine1,
        addressLine2Snapshot: addrApexHQ.addressLine2,
        citySnapshot: addrApexHQ.city,
        stateSnapshot: addrApexHQ.state,
        postalCodeSnapshot: addrApexHQ.postalCode,
        deliveryTimeMinutes: 750,
        packagingNameSnapshot: 'Standard Eco Box',
        deliveryInstructionsSnapshot: apexComp.driverInstructions,
      },
      lines: [
        {
          dishId: dishBowl.id,
          dishNameSnapshot: dishBowl.name,
          dishSkuSnapshot: dishBowl.sku,
          dishUnitPriceCents: 850,
          quantity: 3,
          lineTotalCents: 2810,
          combinations: [
            {
              quantity: 2,
              unitPriceCents: 850,
              combinationTotalCents: 1700,
              options: [
                {
                  optionId: optExtraPaneer.id,
                  optionGroupId: groupBowlAddon.id,
                  optionGroupNameSnapshot: groupBowlAddon.name,
                  optionNameSnapshot: optExtraPaneer.name,
                  optionPriceCents: 0,
                  portionSizeId: portionRegular.id,
                  portionNameSnapshot: 'Regular',
                  portionExtraCents: 0,
                },
              ],
            },
            {
              quantity: 1,
              unitPriceCents: 1110,
              combinationTotalCents: 1110,
              options: [
                {
                  optionId: optAvocado.id,
                  optionGroupId: groupBowlAddon.id,
                  optionGroupNameSnapshot: groupBowlAddon.name,
                  optionNameSnapshot: optAvocado.name,
                  optionPriceCents: 160,
                  portionSizeId: portionLarge.id,
                  portionNameSnapshot: 'Large',
                  portionExtraCents: 100,
                },
              ],
            },
          ],
        },
      ],
      events: [
        { type: OrderEventType.ORDER_CREATED, createdAt: new Date('2026-10-01T10:00:00.000Z') },
        { type: OrderEventType.ORDER_PLACED, createdAt: new Date('2026-10-01T11:00:00.000Z') },
        { type: OrderEventType.ORDER_CONFIRMED, createdAt: new Date('2026-10-02T16:00:00.000Z') },
      ],
    },
    // 3. PLACED order next week (Summit Health)
    {
      orderNumber: 'FK-2026-0003',
      employeeId: empAnanya!.id,
      companyId: summitComp.id,
      deliveryDate: new Date('2026-10-14T00:00:00.000Z'),
      deliveryTimeMinutes: 780,
      packagingTypeId: pkgBento,
      status: OrderStatus.PLACED,
      totalCents: 1900,
      placedAt: new Date('2026-10-02T14:00:00.000Z'),
      delivery: {
        companyAddressId: addrSummit.id,
        addressLabelSnapshot: addrSummit.label,
        addressLine1Snapshot: addrSummit.addressLine1,
        addressLine2Snapshot: addrSummit.addressLine2,
        citySnapshot: addrSummit.city,
        stateSnapshot: addrSummit.state,
        postalCodeSnapshot: addrSummit.postalCode,
        deliveryTimeMinutes: 780,
        packagingNameSnapshot: 'Premium Bento Pack',
        deliveryInstructionsSnapshot: summitComp.driverInstructions,
      },
      lines: [
        {
          dishId: dishBowl.id,
          dishNameSnapshot: dishBowl.name,
          dishSkuSnapshot: dishBowl.sku,
          dishUnitPriceCents: 950,
          quantity: 2,
          lineTotalCents: 1900,
          combinations: [
            {
              quantity: 2,
              unitPriceCents: 950,
              combinationTotalCents: 1900,
              options: [
                {
                  optionId: optExtraPaneer.id,
                  optionGroupId: groupBowlAddon.id,
                  optionGroupNameSnapshot: groupBowlAddon.name,
                  optionNameSnapshot: optExtraPaneer.name,
                  optionPriceCents: 0,
                  portionSizeId: portionRegular.id,
                  portionNameSnapshot: 'Regular',
                  portionExtraCents: 0,
                },
              ],
            },
          ],
        },
      ],
      events: [
        { type: OrderEventType.ORDER_CREATED, createdAt: new Date('2026-10-02T13:30:00.000Z') },
        { type: OrderEventType.ORDER_PLACED, createdAt: new Date('2026-10-02T14:00:00.000Z') },
      ],
    },
    // 4. DRAFT order next week (Verdant)
    {
      orderNumber: 'FK-2026-0004',
      employeeId: empSiddharth!.id,
      companyId: verdantComp.id,
      deliveryDate: new Date('2026-10-15T00:00:00.000Z'),
      deliveryTimeMinutes: 720,
      packagingTypeId: pkgBio,
      status: OrderStatus.DRAFT,
      totalCents: 845,
      delivery: {
        companyAddressId: addrVerdant.id,
        addressLabelSnapshot: addrVerdant.label,
        addressLine1Snapshot: addrVerdant.addressLine1,
        addressLine2Snapshot: addrVerdant.addressLine2,
        citySnapshot: addrVerdant.city,
        stateSnapshot: addrVerdant.state,
        postalCodeSnapshot: addrVerdant.postalCode,
        deliveryTimeMinutes: 720,
        packagingNameSnapshot: 'Biodegradable Meal Tray',
        deliveryInstructionsSnapshot: verdantComp.driverInstructions,
      },
      lines: [
        {
          dishId: dishSalad.id,
          dishNameSnapshot: dishSalad.name,
          dishSkuSnapshot: dishSalad.sku,
          dishUnitPriceCents: 800,
          quantity: 1,
          lineTotalCents: 845,
          combinations: [
            {
              quantity: 1,
              unitPriceCents: 845,
              combinationTotalCents: 845,
              options: [
                {
                  optionId: optHoneyMustard.id,
                  optionGroupId: groupDressing.id,
                  optionGroupNameSnapshot: groupDressing.name,
                  optionNameSnapshot: optHoneyMustard.name,
                  optionPriceCents: 45,
                  portionSizeId: null,
                  portionNameSnapshot: null,
                  portionExtraCents: 0,
                },
              ],
            },
          ],
        },
      ],
      events: [
        { type: OrderEventType.ORDER_CREATED, createdAt: new Date('2026-10-03T10:00:00.000Z') },
      ],
    },
    // 5. CANCELLED order (Apex)
    {
      orderNumber: 'FK-2026-0005',
      employeeId: empPriya!.id,
      companyId: apexComp.id,
      deliveryDate: new Date('2026-09-25T00:00:00.000Z'),
      deliveryTimeMinutes: 750,
      packagingTypeId: pkgEco,
      status: OrderStatus.CANCELLED,
      totalCents: 790,
      cancellationReason: 'Employee cancelled before cutoff',
      placedAt: new Date('2026-09-22T09:00:00.000Z'),
      cancelledAt: new Date('2026-09-23T11:00:00.000Z'),
      delivery: {
        companyAddressId: addrApexHQ.id,
        addressLabelSnapshot: addrApexHQ.label,
        addressLine1Snapshot: addrApexHQ.addressLine1,
        addressLine2Snapshot: addrApexHQ.addressLine2,
        citySnapshot: addrApexHQ.city,
        stateSnapshot: addrApexHQ.state,
        postalCodeSnapshot: addrApexHQ.postalCode,
        deliveryTimeMinutes: 750,
        packagingNameSnapshot: 'Standard Eco Box',
        deliveryInstructionsSnapshot: apexComp.driverInstructions,
      },
      lines: [
        {
          dishId: dishSalad.id,
          dishNameSnapshot: dishSalad.name,
          dishSkuSnapshot: dishSalad.sku,
          dishUnitPriceCents: 750,
          quantity: 1,
          lineTotalCents: 790,
          combinations: [
            {
              quantity: 1,
              unitPriceCents: 790,
              combinationTotalCents: 790,
              options: [
                {
                  optionId: optHoneyMustard.id,
                  optionGroupId: groupDressing.id,
                  optionGroupNameSnapshot: groupDressing.name,
                  optionNameSnapshot: optHoneyMustard.name,
                  optionPriceCents: 40,
                  portionSizeId: null,
                  portionNameSnapshot: null,
                  portionExtraCents: 0,
                },
              ],
            },
          ],
        },
      ],
      events: [
        { type: OrderEventType.ORDER_CREATED, createdAt: new Date('2026-09-22T08:30:00.000Z') },
        { type: OrderEventType.ORDER_PLACED, createdAt: new Date('2026-09-22T09:00:00.000Z') },
        { type: OrderEventType.ORDER_CANCELLED, note: 'Employee cancelled before cutoff', createdAt: new Date('2026-09-23T11:00:00.000Z') },
      ],
    },
    // 6. REJECTED order (Summit Health)
    {
      orderNumber: 'FK-2026-0006',
      employeeId: empVikram!.id,
      companyId: summitComp.id,
      deliveryDate: new Date('2026-09-26T00:00:00.000Z'),
      deliveryTimeMinutes: 780,
      packagingTypeId: pkgBento,
      status: OrderStatus.REJECTED,
      totalCents: 950,
      cancellationReason: 'Kitchen capacity exceeded for selected delivery slot',
      placedAt: new Date('2026-09-23T10:00:00.000Z'),
      rejectedAt: new Date('2026-09-24T12:00:00.000Z'),
      delivery: {
        companyAddressId: addrSummit.id,
        addressLabelSnapshot: addrSummit.label,
        addressLine1Snapshot: addrSummit.addressLine1,
        addressLine2Snapshot: addrSummit.addressLine2,
        citySnapshot: addrSummit.city,
        stateSnapshot: addrSummit.state,
        postalCodeSnapshot: addrSummit.postalCode,
        deliveryTimeMinutes: 780,
        packagingNameSnapshot: 'Premium Bento Pack',
        deliveryInstructionsSnapshot: summitComp.driverInstructions,
      },
      lines: [
        {
          dishId: dishBowl.id,
          dishNameSnapshot: dishBowl.name,
          dishSkuSnapshot: dishBowl.sku,
          dishUnitPriceCents: 950,
          quantity: 1,
          lineTotalCents: 950,
          combinations: [
            {
              quantity: 1,
              unitPriceCents: 950,
              combinationTotalCents: 950,
              options: [
                {
                  optionId: optExtraPaneer.id,
                  optionGroupId: groupBowlAddon.id,
                  optionGroupNameSnapshot: groupBowlAddon.name,
                  optionNameSnapshot: optExtraPaneer.name,
                  optionPriceCents: 0,
                  portionSizeId: portionRegular.id,
                  portionNameSnapshot: 'Regular',
                  portionExtraCents: 0,
                },
              ],
            },
          ],
        },
      ],
      events: [
        { type: OrderEventType.ORDER_CREATED, createdAt: new Date('2026-09-23T09:30:00.000Z') },
        { type: OrderEventType.ORDER_PLACED, createdAt: new Date('2026-09-23T10:00:00.000Z') },
        { type: OrderEventType.ORDER_REJECTED, note: 'Kitchen capacity exceeded for selected delivery slot', createdAt: new Date('2026-09-24T12:00:00.000Z') },
      ],
    },
    // 7. CONFIRMED with ADMIN_OVERRIDE (Apex)
    {
      orderNumber: 'FK-2026-0007',
      employeeId: empPriya!.id,
      companyId: apexComp.id,
      deliveryDate: new Date('2026-10-06T00:00:00.000Z'),
      deliveryTimeMinutes: 750,
      packagingTypeId: pkgEco,
      status: OrderStatus.CONFIRMED,
      totalCents: 1580,
      placedAt: new Date('2026-10-01T15:00:00.000Z'),
      confirmedAt: new Date('2026-10-02T16:00:00.000Z'),
      plannedDispatchReadyAt: timings0007.plannedDispatchReadyAt,
      plannedKitchenReadyAt: timings0007.plannedKitchenReadyAt,
      delivery: {
        companyAddressId: addrApexWhitefield.id, // overridden from HQ to Whitefield
        addressLabelSnapshot: addrApexWhitefield.label,
        addressLine1Snapshot: addrApexWhitefield.addressLine1,
        addressLine2Snapshot: addrApexWhitefield.addressLine2,
        citySnapshot: addrApexWhitefield.city,
        stateSnapshot: addrApexWhitefield.state,
        postalCodeSnapshot: addrApexWhitefield.postalCode,
        deliveryTimeMinutes: 750,
        packagingNameSnapshot: 'Standard Eco Box',
        deliveryInstructionsSnapshot: apexComp.driverInstructions,
      },
      lines: [
        {
          dishId: dishSalad.id,
          dishNameSnapshot: dishSalad.name,
          dishSkuSnapshot: dishSalad.sku,
          dishUnitPriceCents: 750,
          quantity: 2,
          lineTotalCents: 1580,
          combinations: [
            {
              quantity: 2,
              unitPriceCents: 790,
              combinationTotalCents: 1580,
              options: [
                {
                  optionId: optHoneyMustard.id,
                  optionGroupId: groupDressing.id,
                  optionGroupNameSnapshot: groupDressing.name,
                  optionNameSnapshot: optHoneyMustard.name,
                  optionPriceCents: 40,
                  portionSizeId: null,
                  portionNameSnapshot: null,
                  portionExtraCents: 0,
                },
              ],
            },
          ],
        },
      ],
      events: [
        { type: OrderEventType.ORDER_CREATED, occurredAt: new Date('2026-10-01T14:30:00.000Z') },
        { type: OrderEventType.ORDER_PLACED, occurredAt: new Date('2026-10-01T15:00:00.000Z') },
        { type: OrderEventType.ORDER_CONFIRMED, occurredAt: new Date('2026-10-02T16:00:00.000Z') },
        {
          type: OrderEventType.ADMIN_OVERRIDE,
          note: 'Delivery address rerouted to Whitefield Campus per facilities manager request',
          metadata: {
            previousValue: { addressLabel: addrApexHQ.label },
            newValue: { addressLabel: addrApexWhitefield.label },
          },
          occurredAt: new Date('2026-10-03T11:00:00.000Z'),
        },
      ],
    },

    // 8. Phase 7: CONFIRMED order for TODAY - partially in progress (Summit Health, 12:00 delivery)
    {
      orderNumber: 'FK-2026-K001',
      employeeId: empAnanya!.id,
      companyId: summitComp.id,
      deliveryDate: todayKolkataDate,
      deliveryTimeMinutes: 720,
      packagingTypeId: pkgBento,
      status: OrderStatus.CONFIRMED,
      totalCents: 1700,
      placedAt: new Date(Date.now() - 48 * 3600 * 1000),
      confirmedAt: new Date(Date.now() - 24 * 3600 * 1000),
      kitchenStartedAt: new Date(Date.now() - 35 * 60 * 1000),
      kitchenReadyAt: null,
      plannedDispatchReadyAt: timingsK001.plannedDispatchReadyAt,
      plannedKitchenReadyAt: timingsK001.plannedKitchenReadyAt,
      delivery: {
        companyAddressId: addrSummit.id,
        addressLabelSnapshot: addrSummit.label,
        addressLine1Snapshot: addrSummit.addressLine1,
        addressLine2Snapshot: addrSummit.addressLine2,
        citySnapshot: addrSummit.city,
        stateSnapshot: addrSummit.state,
        postalCodeSnapshot: addrSummit.postalCode,
        deliveryTimeMinutes: 720,
        packagingNameSnapshot: 'Premium Bento Pack',
        deliveryInstructionsSnapshot: summitComp.driverInstructions,
      },
      lines: [
        {
          dishId: dishSalad.id,
          dishNameSnapshot: dishSalad.name,
          dishSkuSnapshot: dishSalad.sku,
          dishUnitPriceCents: 850,
          quantity: 1,
          lineTotalCents: 850,
          combinations: [
            {
              quantity: 1,
              unitPriceCents: 850,
              combinationTotalCents: 850,
              unitStatus: KitchenUnitStatus.IN_PROGRESS,
              startedAt: new Date(Date.now() - 35 * 60 * 1000),
              options: [],
            },
          ],
        },
        {
          dishId: dishBowl.id,
          dishNameSnapshot: dishBowl.name,
          dishSkuSnapshot: dishBowl.sku,
          dishUnitPriceCents: 850,
          quantity: 1,
          lineTotalCents: 850,
          combinations: [
            {
              quantity: 1,
              unitPriceCents: 850,
              combinationTotalCents: 850,
              unitStatus: KitchenUnitStatus.NOT_STARTED,
              options: [],
            },
          ],
        },
      ],
      events: [
        { type: OrderEventType.ORDER_CREATED, occurredAt: new Date(Date.now() - 48 * 3600 * 1000) },
        { type: OrderEventType.ORDER_PLACED, occurredAt: new Date(Date.now() - 47 * 3600 * 1000) },
        { type: OrderEventType.ORDER_CONFIRMED, occurredAt: new Date(Date.now() - 24 * 3600 * 1000) },
        { type: OrderEventType.KITCHEN_STARTED, occurredAt: new Date(Date.now() - 35 * 60 * 1000) },
      ],
    },

    // 9. Phase 7: CONFIRMED order for TODAY - fully kitchen ready (Apex, 13:00 delivery)
    {
      orderNumber: 'FK-2026-K002',
      employeeId: empRajesh!.id,
      companyId: apexComp.id,
      deliveryDate: todayKolkataDate,
      deliveryTimeMinutes: 780,
      packagingTypeId: pkgEco,
      status: OrderStatus.CONFIRMED,
      totalCents: 1050,
      placedAt: new Date(Date.now() - 48 * 3600 * 1000),
      confirmedAt: new Date(Date.now() - 24 * 3600 * 1000),
      kitchenStartedAt: new Date(Date.now() - 60 * 60 * 1000),
      kitchenReadyAt: new Date(Date.now() - 10 * 60 * 1000),
      plannedDispatchReadyAt: timingsK002.plannedDispatchReadyAt,
      plannedKitchenReadyAt: timingsK002.plannedKitchenReadyAt,
      delivery: {
        companyAddressId: addrApexHQ.id,
        addressLabelSnapshot: addrApexHQ.label,
        addressLine1Snapshot: addrApexHQ.addressLine1,
        addressLine2Snapshot: addrApexHQ.addressLine2,
        citySnapshot: addrApexHQ.city,
        stateSnapshot: addrApexHQ.state,
        postalCodeSnapshot: addrApexHQ.postalCode,
        deliveryTimeMinutes: 780,
        packagingNameSnapshot: 'Standard Eco Box',
        deliveryInstructionsSnapshot: apexComp.driverInstructions,
      },
      lines: [
        {
          dishId: dishBowl.id,
          dishNameSnapshot: dishBowl.name,
          dishSkuSnapshot: dishBowl.sku,
          dishUnitPriceCents: 850,
          quantity: 1,
          lineTotalCents: 850,
          combinations: [
            {
              quantity: 1,
              unitPriceCents: 850,
              combinationTotalCents: 850,
              unitStatus: KitchenUnitStatus.DONE,
              startedAt: new Date(Date.now() - 60 * 60 * 1000),
              completedAt: new Date(Date.now() - 20 * 60 * 1000),
              options: [],
            },
          ],
        },
        {
          dishId: dishBrownie.id,
          dishNameSnapshot: dishBrownie.name,
          dishSkuSnapshot: dishBrownie.sku,
          dishUnitPriceCents: 200,
          quantity: 1,
          lineTotalCents: 200,
          combinations: [
            {
              quantity: 1,
              unitPriceCents: 200,
              combinationTotalCents: 200,
              unitStatus: KitchenUnitStatus.DONE,
              startedAt: new Date(Date.now() - 45 * 60 * 1000),
              completedAt: new Date(Date.now() - 10 * 60 * 1000),
              options: [],
            },
          ],
        },
      ],
      events: [
        { type: OrderEventType.ORDER_CREATED, occurredAt: new Date(Date.now() - 48 * 3600 * 1000) },
        { type: OrderEventType.ORDER_PLACED, occurredAt: new Date(Date.now() - 47 * 3600 * 1000) },
        { type: OrderEventType.ORDER_CONFIRMED, occurredAt: new Date(Date.now() - 24 * 3600 * 1000) },
        { type: OrderEventType.KITCHEN_STARTED, occurredAt: new Date(Date.now() - 60 * 60 * 1000) },
        { type: OrderEventType.KITCHEN_READY, occurredAt: new Date(Date.now() - 10 * 60 * 1000) },
      ],
    },

    // 10. Phase 7: CONFIRMED order for TODAY - not started yet (Verdant, 18:30 delivery)
    {
      orderNumber: 'FK-2026-K003',
      employeeId: empSiddharth!.id,
      companyId: verdantComp.id,
      deliveryDate: todayKolkataDate,
      deliveryTimeMinutes: 1110,
      packagingTypeId: pkgBio,
      status: OrderStatus.CONFIRMED,
      totalCents: 1020,
      placedAt: new Date(Date.now() - 48 * 3600 * 1000),
      confirmedAt: new Date(Date.now() - 24 * 3600 * 1000),
      kitchenStartedAt: null,
      kitchenReadyAt: null,
      plannedDispatchReadyAt: timingsK003.plannedDispatchReadyAt,
      plannedKitchenReadyAt: timingsK003.plannedKitchenReadyAt,
      delivery: {
        companyAddressId: addrVerdant.id,
        addressLabelSnapshot: addrVerdant.label,
        addressLine1Snapshot: addrVerdant.addressLine1,
        addressLine2Snapshot: addrVerdant.addressLine2,
        citySnapshot: addrVerdant.city,
        stateSnapshot: addrVerdant.state,
        postalCodeSnapshot: addrVerdant.postalCode,
        deliveryTimeMinutes: 1110,
        packagingNameSnapshot: 'Biodegradable Meal Tray',
        deliveryInstructionsSnapshot: verdantComp.driverInstructions,
      },
      lines: [
        {
          dishId: dishSalad.id,
          dishNameSnapshot: dishSalad.name,
          dishSkuSnapshot: dishSalad.sku,
          dishUnitPriceCents: 800,
          quantity: 1,
          lineTotalCents: 800,
          combinations: [
            {
              quantity: 1,
              unitPriceCents: 800,
              combinationTotalCents: 800,
              unitStatus: KitchenUnitStatus.NOT_STARTED,
              options: [],
            },
          ],
        },
        {
          dishId: dishBrownie.id,
          dishNameSnapshot: dishBrownie.name,
          dishSkuSnapshot: dishBrownie.sku,
          dishUnitPriceCents: 220,
          quantity: 1,
          lineTotalCents: 220,
          combinations: [
            {
              quantity: 1,
              unitPriceCents: 220,
              combinationTotalCents: 220,
              unitStatus: KitchenUnitStatus.NOT_STARTED,
              options: [],
            },
          ],
        },
      ],
      events: [
        { type: OrderEventType.ORDER_CREATED, occurredAt: new Date(Date.now() - 48 * 3600 * 1000) },
        { type: OrderEventType.ORDER_PLACED, occurredAt: new Date(Date.now() - 47 * 3600 * 1000) },
        { type: OrderEventType.ORDER_CONFIRMED, occurredAt: new Date(Date.now() - 24 * 3600 * 1000) },
      ],
    },

    // 11. Phase 8: DISPATCH READY multi-order 1 (Apex, 11:40 delivery, addrApexHQ)
    {
      orderNumber: 'FK-2026-D001',
      employeeId: empRajesh!.id,
      companyId: apexComp.id,
      deliveryDate: todayKolkataDate,
      deliveryTimeMinutes: 700,
      packagingTypeId: pkgEco,
      status: OrderStatus.CONFIRMED,
      totalCents: 850,
      placedAt: new Date(Date.now() - 24 * 3600 * 1000),
      confirmedAt: new Date(Date.now() - 12 * 3600 * 1000),
      kitchenStartedAt: new Date(Date.now() - 2 * 3600 * 1000),
      kitchenReadyAt: new Date(Date.now() - 60 * 60 * 1000),
      plannedDispatchReadyAt: timingsD001.plannedDispatchReadyAt,
      plannedKitchenReadyAt: timingsD001.plannedKitchenReadyAt,
      delivery: {
        companyAddressId: addrApexHQ.id,
        addressLabelSnapshot: addrApexHQ.label,
        addressLine1Snapshot: addrApexHQ.addressLine1,
        addressLine2Snapshot: addrApexHQ.addressLine2,
        citySnapshot: addrApexHQ.city,
        stateSnapshot: addrApexHQ.state,
        postalCodeSnapshot: addrApexHQ.postalCode,
        deliveryTimeMinutes: 700,
        packagingNameSnapshot: 'Standard Eco Box',
        deliveryInstructionsSnapshot: apexComp.driverInstructions,
      },
      lines: [
        {
          dishId: dishBowl.id,
          dishNameSnapshot: dishBowl.name,
          dishSkuSnapshot: dishBowl.sku,
          dishUnitPriceCents: 850,
          quantity: 1,
          lineTotalCents: 850,
          combinations: [
            {
              quantity: 1,
              unitPriceCents: 850,
              combinationTotalCents: 850,
              unitStatus: KitchenUnitStatus.DONE,
              startedAt: new Date(Date.now() - 2 * 3600 * 1000),
              completedAt: new Date(Date.now() - 60 * 60 * 1000),
              options: [],
            },
          ],
        },
      ],
      events: [
        { type: OrderEventType.ORDER_CREATED, occurredAt: new Date(Date.now() - 24 * 3600 * 1000) },
        { type: OrderEventType.ORDER_PLACED, occurredAt: new Date(Date.now() - 23 * 3600 * 1000) },
        { type: OrderEventType.ORDER_CONFIRMED, occurredAt: new Date(Date.now() - 12 * 3600 * 1000) },
        { type: OrderEventType.KITCHEN_STARTED, occurredAt: new Date(Date.now() - 2 * 3600 * 1000) },
        { type: OrderEventType.KITCHEN_READY, occurredAt: new Date(Date.now() - 60 * 60 * 1000) },
      ],
    },

    // 12. Phase 8: DISPATCH READY multi-order 2 (Apex, 11:40 delivery, addrApexHQ -> same drop as D001!)
    {
      orderNumber: 'FK-2026-D002',
      employeeId: empPriya!.id,
      companyId: apexComp.id,
      deliveryDate: todayKolkataDate,
      deliveryTimeMinutes: 700,
      packagingTypeId: pkgEco,
      status: OrderStatus.CONFIRMED,
      totalCents: 750,
      placedAt: new Date(Date.now() - 24 * 3600 * 1000),
      confirmedAt: new Date(Date.now() - 12 * 3600 * 1000),
      kitchenStartedAt: new Date(Date.now() - 2 * 3600 * 1000),
      kitchenReadyAt: new Date(Date.now() - 60 * 60 * 1000),
      plannedDispatchReadyAt: timingsD002.plannedDispatchReadyAt,
      plannedKitchenReadyAt: timingsD002.plannedKitchenReadyAt,
      delivery: {
        companyAddressId: addrApexHQ.id,
        addressLabelSnapshot: addrApexHQ.label,
        addressLine1Snapshot: addrApexHQ.addressLine1,
        addressLine2Snapshot: addrApexHQ.addressLine2,
        citySnapshot: addrApexHQ.city,
        stateSnapshot: addrApexHQ.state,
        postalCodeSnapshot: addrApexHQ.postalCode,
        deliveryTimeMinutes: 700,
        packagingNameSnapshot: 'Standard Eco Box',
        deliveryInstructionsSnapshot: apexComp.driverInstructions,
      },
      lines: [
        {
          dishId: dishSalad.id,
          dishNameSnapshot: dishSalad.name,
          dishSkuSnapshot: dishSalad.sku,
          dishUnitPriceCents: 750,
          quantity: 1,
          lineTotalCents: 750,
          combinations: [
            {
              quantity: 1,
              unitPriceCents: 750,
              combinationTotalCents: 750,
              unitStatus: KitchenUnitStatus.DONE,
              startedAt: new Date(Date.now() - 2 * 3600 * 1000),
              completedAt: new Date(Date.now() - 60 * 60 * 1000),
              options: [],
            },
          ],
        },
      ],
      events: [
        { type: OrderEventType.ORDER_CREATED, occurredAt: new Date(Date.now() - 24 * 3600 * 1000) },
        { type: OrderEventType.ORDER_PLACED, occurredAt: new Date(Date.now() - 23 * 3600 * 1000) },
        { type: OrderEventType.ORDER_CONFIRMED, occurredAt: new Date(Date.now() - 12 * 3600 * 1000) },
        { type: OrderEventType.KITCHEN_STARTED, occurredAt: new Date(Date.now() - 2 * 3600 * 1000) },
        { type: OrderEventType.KITCHEN_READY, occurredAt: new Date(Date.now() - 60 * 60 * 1000) },
      ],
    },

    // 13. Phase 8: OUT_FOR_DELIVERY order (Apex, 14:00 delivery, addrApexHQ -> separate drop due to time!)
    {
      orderNumber: 'FK-2026-D003',
      employeeId: empRajesh!.id,
      companyId: apexComp.id,
      deliveryDate: todayKolkataDate,
      deliveryTimeMinutes: 840,
      packagingTypeId: pkgEco,
      status: OrderStatus.CONFIRMED,
      totalCents: 200,
      placedAt: new Date(Date.now() - 24 * 3600 * 1000),
      confirmedAt: new Date(Date.now() - 12 * 3600 * 1000),
      kitchenStartedAt: new Date(Date.now() - 3 * 3600 * 1000),
      kitchenReadyAt: new Date(Date.now() - 90 * 60 * 1000),
      plannedDispatchReadyAt: timingsD003.plannedDispatchReadyAt,
      plannedKitchenReadyAt: timingsD003.plannedKitchenReadyAt,
      delivery: {
        companyAddressId: addrApexHQ.id,
        addressLabelSnapshot: addrApexHQ.label,
        addressLine1Snapshot: addrApexHQ.addressLine1,
        addressLine2Snapshot: addrApexHQ.addressLine2,
        citySnapshot: addrApexHQ.city,
        stateSnapshot: addrApexHQ.state,
        postalCodeSnapshot: addrApexHQ.postalCode,
        deliveryTimeMinutes: 840,
        packagingNameSnapshot: 'Standard Eco Box',
        deliveryInstructionsSnapshot: apexComp.driverInstructions,
      },
      lines: [
        {
          dishId: dishBrownie.id,
          dishNameSnapshot: dishBrownie.name,
          dishSkuSnapshot: dishBrownie.sku,
          dishUnitPriceCents: 200,
          quantity: 1,
          lineTotalCents: 200,
          combinations: [
            {
              quantity: 1,
              unitPriceCents: 200,
              combinationTotalCents: 200,
              unitStatus: KitchenUnitStatus.DONE,
              startedAt: new Date(Date.now() - 3 * 3600 * 1000),
              completedAt: new Date(Date.now() - 90 * 60 * 1000),
              options: [],
            },
          ],
        },
      ],
      events: [
        { type: OrderEventType.ORDER_CREATED, occurredAt: new Date(Date.now() - 24 * 3600 * 1000) },
        { type: OrderEventType.ORDER_PLACED, occurredAt: new Date(Date.now() - 23 * 3600 * 1000) },
        { type: OrderEventType.ORDER_CONFIRMED, occurredAt: new Date(Date.now() - 12 * 3600 * 1000) },
        { type: OrderEventType.KITCHEN_STARTED, occurredAt: new Date(Date.now() - 3 * 3600 * 1000) },
        { type: OrderEventType.KITCHEN_READY, occurredAt: new Date(Date.now() - 90 * 60 * 1000) },
      ],
    },

    // 14. Phase 8: UNASSIGNED DISPATCH_READY order (Summit, 14:00 delivery, addrSummit)
    {
      orderNumber: 'FK-2026-D004',
      employeeId: empAnanya!.id,
      companyId: summitComp.id,
      deliveryDate: todayKolkataDate,
      deliveryTimeMinutes: 840,
      packagingTypeId: pkgBento,
      status: OrderStatus.CONFIRMED,
      totalCents: 850,
      placedAt: new Date(Date.now() - 24 * 3600 * 1000),
      confirmedAt: new Date(Date.now() - 12 * 3600 * 1000),
      kitchenStartedAt: new Date(Date.now() - 2 * 3600 * 1000),
      kitchenReadyAt: new Date(Date.now() - 60 * 60 * 1000),
      plannedDispatchReadyAt: timingsD004.plannedDispatchReadyAt,
      plannedKitchenReadyAt: timingsD004.plannedKitchenReadyAt,
      delivery: {
        companyAddressId: addrSummit.id,
        addressLabelSnapshot: addrSummit.label,
        addressLine1Snapshot: addrSummit.addressLine1,
        addressLine2Snapshot: addrSummit.addressLine2,
        citySnapshot: addrSummit.city,
        stateSnapshot: addrSummit.state,
        postalCodeSnapshot: addrSummit.postalCode,
        deliveryTimeMinutes: 840,
        packagingNameSnapshot: 'Premium Bento Pack',
        deliveryInstructionsSnapshot: summitComp.driverInstructions,
      },
      lines: [
        {
          dishId: dishBowl.id,
          dishNameSnapshot: dishBowl.name,
          dishSkuSnapshot: dishBowl.sku,
          dishUnitPriceCents: 850,
          quantity: 1,
          lineTotalCents: 850,
          combinations: [
            {
              quantity: 1,
              unitPriceCents: 850,
              combinationTotalCents: 850,
              unitStatus: KitchenUnitStatus.DONE,
              startedAt: new Date(Date.now() - 2 * 3600 * 1000),
              completedAt: new Date(Date.now() - 60 * 60 * 1000),
              options: [],
            },
          ],
        },
      ],
      events: [
        { type: OrderEventType.ORDER_CREATED, occurredAt: new Date(Date.now() - 24 * 3600 * 1000) },
        { type: OrderEventType.ORDER_PLACED, occurredAt: new Date(Date.now() - 23 * 3600 * 1000) },
        { type: OrderEventType.ORDER_CONFIRMED, occurredAt: new Date(Date.now() - 12 * 3600 * 1000) },
        { type: OrderEventType.KITCHEN_STARTED, occurredAt: new Date(Date.now() - 2 * 3600 * 1000) },
        { type: OrderEventType.KITCHEN_READY, occurredAt: new Date(Date.now() - 60 * 60 * 1000) },
      ],
    },

    // 15. Phase 8: DELIVERED order with Proof (Verdant, 14:00 delivery, addrVerdantHub -> same physical address as Summit, separate company!)
    {
      orderNumber: 'FK-2026-D005',
      employeeId: empSiddharth!.id,
      companyId: verdantComp.id,
      deliveryDate: todayKolkataDate,
      deliveryTimeMinutes: 840,
      packagingTypeId: pkgBio,
      status: OrderStatus.DELIVERED,
      totalCents: 800,
      placedAt: new Date(Date.now() - 24 * 3600 * 1000),
      confirmedAt: new Date(Date.now() - 12 * 3600 * 1000),
      kitchenStartedAt: new Date(Date.now() - 3 * 3600 * 1000),
      kitchenReadyAt: new Date(Date.now() - 2 * 3600 * 1000),
      deliveredAt: new Date(Date.now() - 30 * 60 * 1000),
      plannedDispatchReadyAt: timingsD005.plannedDispatchReadyAt,
      plannedKitchenReadyAt: timingsD005.plannedKitchenReadyAt,
      delivery: {
        companyAddressId: addrVerdantHub.id,
        addressLabelSnapshot: addrVerdantHub.label,
        addressLine1Snapshot: addrVerdantHub.addressLine1,
        addressLine2Snapshot: addrVerdantHub.addressLine2,
        citySnapshot: addrVerdantHub.city,
        stateSnapshot: addrVerdantHub.state,
        postalCodeSnapshot: addrVerdantHub.postalCode,
        deliveryTimeMinutes: 840,
        packagingNameSnapshot: 'Biodegradable Meal Tray',
        deliveryInstructionsSnapshot: verdantComp.driverInstructions,
      },
      lines: [
        {
          dishId: dishSalad.id,
          dishNameSnapshot: dishSalad.name,
          dishSkuSnapshot: dishSalad.sku,
          dishUnitPriceCents: 800,
          quantity: 1,
          lineTotalCents: 800,
          combinations: [
            {
              quantity: 1,
              unitPriceCents: 800,
              combinationTotalCents: 800,
              unitStatus: KitchenUnitStatus.DONE,
              startedAt: new Date(Date.now() - 3 * 3600 * 1000),
              completedAt: new Date(Date.now() - 2 * 3600 * 1000),
              options: [],
            },
          ],
        },
      ],
      events: [
        { type: OrderEventType.ORDER_CREATED, occurredAt: new Date(Date.now() - 24 * 3600 * 1000) },
        { type: OrderEventType.ORDER_PLACED, occurredAt: new Date(Date.now() - 23 * 3600 * 1000) },
        { type: OrderEventType.ORDER_CONFIRMED, occurredAt: new Date(Date.now() - 12 * 3600 * 1000) },
        { type: OrderEventType.KITCHEN_STARTED, occurredAt: new Date(Date.now() - 3 * 3600 * 1000) },
        { type: OrderEventType.KITCHEN_READY, occurredAt: new Date(Date.now() - 2 * 3600 * 1000) },
        { type: OrderEventType.DELIVERED, occurredAt: new Date(Date.now() - 30 * 60 * 1000) },
      ],
    },

    // 16. Phase 9: Confirmed uninvoiced order 1 (Summit, Ananya)
    {
      orderNumber: 'FK-2026-B001',
      employeeId: empAnanya!.id,
      companyId: summitComp.id,
      deliveryDate: todayKolkataDate,
      deliveryTimeMinutes: 780,
      packagingTypeId: pkgEco,
      status: OrderStatus.CONFIRMED,
      totalCents: 1500,
      placedAt: new Date(Date.now() - 24 * 3600 * 1000),
      confirmedAt: new Date(Date.now() - 12 * 3600 * 1000),
      delivery: {
        companyAddressId: addrSummit.id,
        addressLabelSnapshot: addrSummit.label,
        addressLine1Snapshot: addrSummit.addressLine1,
        addressLine2Snapshot: addrSummit.addressLine2,
        citySnapshot: addrSummit.city,
        stateSnapshot: addrSummit.state,
        postalCodeSnapshot: addrSummit.postalCode,
        deliveryTimeMinutes: 780,
        packagingNameSnapshot: 'Standard Eco Box',
        deliveryInstructionsSnapshot: summitComp.driverInstructions,
      },
      lines: [
        {
          dishId: dishSalad.id,
          dishNameSnapshot: dishSalad.name,
          dishSkuSnapshot: dishSalad.sku,
          dishUnitPriceCents: 1500,
          quantity: 1,
          lineTotalCents: 1500,
          combinations: [
            {
              quantity: 1,
              unitPriceCents: 1500,
              combinationTotalCents: 1500,
              unitStatus: KitchenUnitStatus.NOT_STARTED,
              options: [],
            },
          ],
        },
      ],
      events: [
        { type: OrderEventType.ORDER_CREATED, occurredAt: new Date(Date.now() - 24 * 3600 * 1000) },
        { type: OrderEventType.ORDER_PLACED, occurredAt: new Date(Date.now() - 23 * 3600 * 1000) },
        { type: OrderEventType.ORDER_CONFIRMED, occurredAt: new Date(Date.now() - 12 * 3600 * 1000) },
      ],
    },

    // 17. Phase 9: Confirmed uninvoiced order 2 (Summit, Vikram)
    {
      orderNumber: 'FK-2026-B002',
      employeeId: empVikram!.id,
      companyId: summitComp.id,
      deliveryDate: todayKolkataDate,
      deliveryTimeMinutes: 780,
      packagingTypeId: pkgBento,
      status: OrderStatus.CONFIRMED,
      totalCents: 2500,
      placedAt: new Date(Date.now() - 24 * 3600 * 1000),
      confirmedAt: new Date(Date.now() - 12 * 3600 * 1000),
      delivery: {
        companyAddressId: addrSummit.id,
        addressLabelSnapshot: addrSummit.label,
        addressLine1Snapshot: addrSummit.addressLine1,
        addressLine2Snapshot: addrSummit.addressLine2,
        citySnapshot: addrSummit.city,
        stateSnapshot: addrSummit.state,
        postalCodeSnapshot: addrSummit.postalCode,
        deliveryTimeMinutes: 780,
        packagingNameSnapshot: 'Premium Bento Pack',
        deliveryInstructionsSnapshot: summitComp.driverInstructions,
      },
      lines: [
        {
          dishId: dishBowl.id,
          dishNameSnapshot: dishBowl.name,
          dishSkuSnapshot: dishBowl.sku,
          dishUnitPriceCents: 2500,
          quantity: 1,
          lineTotalCents: 2500,
          combinations: [
            {
              quantity: 1,
              unitPriceCents: 2500,
              combinationTotalCents: 2500,
              unitStatus: KitchenUnitStatus.NOT_STARTED,
              options: [],
            },
          ],
        },
      ],
      events: [
        { type: OrderEventType.ORDER_CREATED, occurredAt: new Date(Date.now() - 24 * 3600 * 1000) },
        { type: OrderEventType.ORDER_PLACED, occurredAt: new Date(Date.now() - 23 * 3600 * 1000) },
        { type: OrderEventType.ORDER_CONFIRMED, occurredAt: new Date(Date.now() - 12 * 3600 * 1000) },
      ],
    },

    // 18. Phase 9: Confirmed order 3 for Unpaid Invoice (Apex, Rajesh)
    {
      orderNumber: 'FK-2026-B003',
      employeeId: empRajesh!.id,
      companyId: apexComp.id,
      deliveryDate: todayKolkataDate,
      deliveryTimeMinutes: 720,
      packagingTypeId: pkgEco,
      status: OrderStatus.CONFIRMED,
      totalCents: 1800,
      placedAt: new Date(Date.now() - 48 * 3600 * 1000),
      confirmedAt: new Date(Date.now() - 36 * 3600 * 1000),
      delivery: {
        companyAddressId: addrApexHQ.id,
        addressLabelSnapshot: addrApexHQ.label,
        addressLine1Snapshot: addrApexHQ.addressLine1,
        addressLine2Snapshot: addrApexHQ.addressLine2,
        citySnapshot: addrApexHQ.city,
        stateSnapshot: addrApexHQ.state,
        postalCodeSnapshot: addrApexHQ.postalCode,
        deliveryTimeMinutes: 720,
        packagingNameSnapshot: 'Standard Eco Box',
        deliveryInstructionsSnapshot: apexComp.driverInstructions,
      },
      lines: [
        {
          dishId: dishSalad.id,
          dishNameSnapshot: dishSalad.name,
          dishSkuSnapshot: dishSalad.sku,
          dishUnitPriceCents: 1800,
          quantity: 1,
          lineTotalCents: 1800,
          combinations: [
            {
              quantity: 1,
              unitPriceCents: 1800,
              combinationTotalCents: 1800,
              unitStatus: KitchenUnitStatus.DONE,
              options: [],
            },
          ],
        },
      ],
      events: [
        { type: OrderEventType.ORDER_CREATED, occurredAt: new Date(Date.now() - 48 * 3600 * 1000) },
        { type: OrderEventType.ORDER_PLACED, occurredAt: new Date(Date.now() - 47 * 3600 * 1000) },
        { type: OrderEventType.ORDER_CONFIRMED, occurredAt: new Date(Date.now() - 36 * 3600 * 1000) },
      ],
    },

    // 19. Phase 9: Confirmed order 4 for Unpaid Invoice (Apex, Priya)
    {
      orderNumber: 'FK-2026-B004',
      employeeId: empPriya!.id,
      companyId: apexComp.id,
      deliveryDate: todayKolkataDate,
      deliveryTimeMinutes: 720,
      packagingTypeId: pkgBento,
      status: OrderStatus.CONFIRMED,
      totalCents: 2200,
      placedAt: new Date(Date.now() - 48 * 3600 * 1000),
      confirmedAt: new Date(Date.now() - 36 * 3600 * 1000),
      delivery: {
        companyAddressId: addrApexHQ.id,
        addressLabelSnapshot: addrApexHQ.label,
        addressLine1Snapshot: addrApexHQ.addressLine1,
        addressLine2Snapshot: addrApexHQ.addressLine2,
        citySnapshot: addrApexHQ.city,
        stateSnapshot: addrApexHQ.state,
        postalCodeSnapshot: addrApexHQ.postalCode,
        deliveryTimeMinutes: 720,
        packagingNameSnapshot: 'Premium Bento Pack',
        deliveryInstructionsSnapshot: apexComp.driverInstructions,
      },
      lines: [
        {
          dishId: dishBowl.id,
          dishNameSnapshot: dishBowl.name,
          dishSkuSnapshot: dishBowl.sku,
          dishUnitPriceCents: 2200,
          quantity: 1,
          lineTotalCents: 2200,
          combinations: [
            {
              quantity: 1,
              unitPriceCents: 2200,
              combinationTotalCents: 2200,
              unitStatus: KitchenUnitStatus.DONE,
              options: [],
            },
          ],
        },
      ],
      events: [
        { type: OrderEventType.ORDER_CREATED, occurredAt: new Date(Date.now() - 48 * 3600 * 1000) },
        { type: OrderEventType.ORDER_PLACED, occurredAt: new Date(Date.now() - 47 * 3600 * 1000) },
        { type: OrderEventType.ORDER_CONFIRMED, occurredAt: new Date(Date.now() - 36 * 3600 * 1000) },
      ],
    },

    // 20. Phase 9: Confirmed order 5 for Paid Invoice (Verdant, Siddharth)
    {
      orderNumber: 'FK-2026-B005',
      employeeId: empSiddharth!.id,
      companyId: verdantComp.id,
      deliveryDate: todayKolkataDate,
      deliveryTimeMinutes: 840,
      packagingTypeId: pkgBio,
      status: OrderStatus.CONFIRMED,
      totalCents: 3200,
      placedAt: new Date(Date.now() - 72 * 3600 * 1000),
      confirmedAt: new Date(Date.now() - 60 * 3600 * 1000),
      delivery: {
        companyAddressId: addrVerdant.id,
        addressLabelSnapshot: addrVerdant.label,
        addressLine1Snapshot: addrVerdant.addressLine1,
        addressLine2Snapshot: addrVerdant.addressLine2,
        citySnapshot: addrVerdant.city,
        stateSnapshot: addrVerdant.state,
        postalCodeSnapshot: addrVerdant.postalCode,
        deliveryTimeMinutes: 840,
        packagingNameSnapshot: 'Biodegradable Meal Tray',
        deliveryInstructionsSnapshot: verdantComp.driverInstructions,
      },
      lines: [
        {
          dishId: dishBrownie.id,
          dishNameSnapshot: dishBrownie.name,
          dishSkuSnapshot: dishBrownie.sku,
          dishUnitPriceCents: 3200,
          quantity: 1,
          lineTotalCents: 3200,
          combinations: [
            {
              quantity: 1,
              unitPriceCents: 3200,
              combinationTotalCents: 3200,
              unitStatus: KitchenUnitStatus.DONE,
              options: [],
            },
          ],
        },
      ],
      events: [
        { type: OrderEventType.ORDER_CREATED, occurredAt: new Date(Date.now() - 72 * 3600 * 1000) },
        { type: OrderEventType.ORDER_PLACED, occurredAt: new Date(Date.now() - 71 * 3600 * 1000) },
        { type: OrderEventType.ORDER_CONFIRMED, occurredAt: new Date(Date.now() - 60 * 3600 * 1000) },
      ],
    },

    // 21. Phase 9: Confirmed order 6 for Mismatch Demo Invoice (Apex, Rajesh)
    {
      orderNumber: 'FK-2026-B006',
      employeeId: empRajesh!.id,
      companyId: apexComp.id,
      deliveryDate: todayKolkataDate,
      deliveryTimeMinutes: 720,
      packagingTypeId: pkgEco,
      status: OrderStatus.CONFIRMED,
      totalCents: 1600,
      placedAt: new Date(Date.now() - 48 * 3600 * 1000),
      confirmedAt: new Date(Date.now() - 36 * 3600 * 1000),
      delivery: {
        companyAddressId: addrApexHQ.id,
        addressLabelSnapshot: addrApexHQ.label,
        addressLine1Snapshot: addrApexHQ.addressLine1,
        addressLine2Snapshot: addrApexHQ.addressLine2,
        citySnapshot: addrApexHQ.city,
        stateSnapshot: addrApexHQ.state,
        postalCodeSnapshot: addrApexHQ.postalCode,
        deliveryTimeMinutes: 720,
        packagingNameSnapshot: 'Standard Eco Box',
        deliveryInstructionsSnapshot: apexComp.driverInstructions,
      },
      lines: [
        {
          dishId: dishSalad.id,
          dishNameSnapshot: dishSalad.name,
          dishSkuSnapshot: dishSalad.sku,
          dishUnitPriceCents: 1600,
          quantity: 1,
          lineTotalCents: 1600,
          combinations: [
            {
              quantity: 1,
              unitPriceCents: 1600,
              combinationTotalCents: 1600,
              unitStatus: KitchenUnitStatus.DONE,
              options: [],
            },
          ],
        },
      ],
      events: [
        { type: OrderEventType.ORDER_CREATED, occurredAt: new Date(Date.now() - 48 * 3600 * 1000) },
        { type: OrderEventType.ORDER_PLACED, occurredAt: new Date(Date.now() - 47 * 3600 * 1000) },
        { type: OrderEventType.ORDER_CONFIRMED, occurredAt: new Date(Date.now() - 36 * 3600 * 1000) },
      ],
    },
  ];

  console.log('Cleaning up existing invoices, drops, and delivery records to preserve idempotency...');
  await prisma.invoiceOrder.deleteMany({});
  await prisma.invoice.deleteMany({});
  await prisma.deliveryRecord.deleteMany({});
  await prisma.dropOrder.deleteMany({});
  await prisma.drop.deleteMany({});

  for (const o of seedOrders) {
    const existing = await prisma.order.findUnique({ where: { orderNumber: o.orderNumber } });
    if (existing) {
      await prisma.order.delete({ where: { id: existing.id } });
    }

    const createdOrder = await prisma.order.create({
      data: {
        orderNumber: o.orderNumber,
        employeeId: o.employeeId,
        companyId: o.companyId,
        deliveryDate: o.deliveryDate,
        deliveryTimeMinutes: o.deliveryTimeMinutes,
        packagingTypeId: o.packagingTypeId,
        status: o.status,
        totalCents: o.totalCents,
        cancellationReason: (o as any).cancellationReason || null,
        placedAt: (o as any).placedAt || null,
        confirmedAt: (o as any).confirmedAt || null,
        deliveredAt: (o as any).deliveredAt || null,
        cancelledAt: (o as any).cancelledAt || null,
        rejectedAt: (o as any).rejectedAt || null,
        kitchenStartedAt: (o as any).kitchenStartedAt || null,
        kitchenReadyAt: (o as any).kitchenReadyAt || null,
        plannedKitchenReadyAt: (o as any).plannedKitchenReadyAt || null,
        plannedDispatchReadyAt: (o as any).plannedDispatchReadyAt || null,
        delivery: {
          create: o.delivery,
        },
        lines: {
          create: o.lines.map((l) => ({
            dishId: l.dishId,
            dishNameSnapshot: l.dishNameSnapshot,
            dishSkuSnapshot: l.dishSkuSnapshot,
            dishUnitPriceCents: l.dishUnitPriceCents,
            quantity: l.quantity,
            lineTotalCents: l.lineTotalCents,
            combinations: {
              create: l.combinations.map((c) => ({
                quantity: c.quantity,
                unitPriceCents: c.unitPriceCents,
                combinationTotalCents: c.combinationTotalCents,
                options: {
                  create: c.options.map((opt) => ({
                    optionId: opt.optionId,
                    optionGroupId: opt.optionGroupId,
                    optionGroupNameSnapshot: opt.optionGroupNameSnapshot,
                    optionNameSnapshot: opt.optionNameSnapshot,
                    optionPriceCents: opt.optionPriceCents,
                    portionSizeId: opt.portionSizeId,
                    portionNameSnapshot: opt.portionNameSnapshot,
                    portionExtraCents: opt.portionExtraCents,
                  })),
                },
              })),
            },
          })),
        },
        events: {
          create: o.events.map((e) => ({
            type: e.type,
            note: (e as any).note || null,
            metadata: (e as any).metadata || null,
            occurredAt: (e as any).occurredAt || new Date(),
          })),
        },
      },
    });

    // Provision KitchenUnits for CONFIRMED orders
    if (createdOrder.status === OrderStatus.CONFIRMED) {
      const fullOrder = await prisma.order.findUnique({
        where: { id: createdOrder.id },
        include: {
          lines: {
            include: {
              dish: true,
              combinations: true,
            },
          },
        },
      });

      if (fullOrder) {
        for (let lIdx = 0; lIdx < fullOrder.lines.length; lIdx++) {
          const line = fullOrder.lines[lIdx];
          const seedLine = o.lines[lIdx];
          for (let cIdx = 0; cIdx < line.combinations.length; cIdx++) {
            const combo = line.combinations[cIdx];
            const seedCombo = seedLine?.combinations[cIdx] as any;

            await prisma.kitchenUnit.upsert({
              where: { orderCombinationId: combo.id },
              create: {
                orderId: fullOrder.id,
                orderCombinationId: combo.id,
                stationId: line.dish.kitchenStationId ?? null,
                status: seedCombo?.unitStatus ?? KitchenUnitStatus.NOT_STARTED,
                startedAt: seedCombo?.startedAt ?? null,
                completedAt: seedCombo?.completedAt ?? null,
              },
              update: {
                stationId: line.dish.kitchenStationId ?? null,
                status: seedCombo?.unitStatus ?? KitchenUnitStatus.NOT_STARTED,
                startedAt: seedCombo?.startedAt ?? null,
                completedAt: seedCombo?.completedAt ?? null,
              },
            });
          }
        }
      }
    }

    console.log(`  ✓ Order: ${createdOrder.orderNumber} [${createdOrder.status}] - ${createdOrder.totalCents}¢`);
  }

  // 10. Seed Realistic Drops for Phase 8
  console.log('Seeding Phase 8 drops, group assignments, and delivery records...');

  const orderD001 = await prisma.order.findUnique({ where: { orderNumber: 'FK-2026-D001' } });
  const orderD002 = await prisma.order.findUnique({ where: { orderNumber: 'FK-2026-D002' } });
  const orderD003 = await prisma.order.findUnique({ where: { orderNumber: 'FK-2026-D003' } });
  const orderD004 = await prisma.order.findUnique({ where: { orderNumber: 'FK-2026-D004' } });
  const orderD005 = await prisma.order.findUnique({ where: { orderNumber: 'FK-2026-D005' } });

  // Drop 1: Multi-order DISPATCH_READY drop (Apex HQ, 700 minutes, Driver assigned from company default)
  const drop1 = await prisma.drop.create({
    data: {
      companyId: apexComp.id,
      deliveryDate: todayKolkataDate,
      deliveryTimeMinutes: 700,
      addressKey: addrApexHQ.id,
      addressLine1Snapshot: addrApexHQ.addressLine1,
      addressLine2Snapshot: addrApexHQ.addressLine2,
      citySnapshot: addrApexHQ.city,
      stateSnapshot: addrApexHQ.state,
      postalCodeSnapshot: addrApexHQ.postalCode,
      standingInstructionsSnapshot: apexComp.driverInstructions,
      driverId: driverUser.id,
      status: DropStatus.DISPATCH_READY,
      kitchenReadyAt: new Date(Date.now() - 60 * 60 * 1000),
      dispatchReadyAt: new Date(Date.now() - 55 * 60 * 1000),
      orders: {
        create: [
          { orderId: orderD001!.id },
          { orderId: orderD002!.id },
        ],
      },
    },
  });
  console.log(`  ✓ Drop 1 (Multi-order): ${drop1.id} [${drop1.status}] - Driver: ${driverUser.email}`);

  // Drop 2: OUT_FOR_DELIVERY drop (Apex HQ, 840 minutes - split due to different delivery time!)
  const drop2 = await prisma.drop.create({
    data: {
      companyId: apexComp.id,
      deliveryDate: todayKolkataDate,
      deliveryTimeMinutes: 840,
      addressKey: addrApexHQ.id,
      addressLine1Snapshot: addrApexHQ.addressLine1,
      addressLine2Snapshot: addrApexHQ.addressLine2,
      citySnapshot: addrApexHQ.city,
      stateSnapshot: addrApexHQ.state,
      postalCodeSnapshot: addrApexHQ.postalCode,
      standingInstructionsSnapshot: apexComp.driverInstructions,
      driverId: driverUser.id,
      status: DropStatus.OUT_FOR_DELIVERY,
      kitchenReadyAt: new Date(Date.now() - 90 * 60 * 1000),
      dispatchReadyAt: new Date(Date.now() - 80 * 60 * 1000),
      outForDeliveryAt: new Date(Date.now() - 40 * 60 * 1000),
      orders: {
        create: [
          { orderId: orderD003!.id },
        ],
      },
    },
  });
  console.log(`  ✓ Drop 2 (Out for delivery): ${drop2.id} [${drop2.status}] - Driver: ${driverUser.email}`);

  // Drop 3: UNASSIGNED DISPATCH_READY drop (Summit, 840 minutes, no default driver)
  const drop3 = await prisma.drop.create({
    data: {
      companyId: summitComp.id,
      deliveryDate: todayKolkataDate,
      deliveryTimeMinutes: 840,
      addressKey: addrSummit.id,
      addressLine1Snapshot: addrSummit.addressLine1,
      addressLine2Snapshot: addrSummit.addressLine2,
      citySnapshot: addrSummit.city,
      stateSnapshot: addrSummit.state,
      postalCodeSnapshot: addrSummit.postalCode,
      standingInstructionsSnapshot: summitComp.driverInstructions,
      driverId: null,
      status: DropStatus.DISPATCH_READY,
      kitchenReadyAt: new Date(Date.now() - 60 * 60 * 1000),
      dispatchReadyAt: new Date(Date.now() - 50 * 60 * 1000),
      orders: {
        create: [
          { orderId: orderD004!.id },
        ],
      },
    },
  });
  console.log(`  ✓ Drop 3 (Unassigned): ${drop3.id} [${drop3.status}] - Driver: Unassigned`);

  // Drop 4: DELIVERED drop with photo & note (Verdant Hub, 840 minutes - same physical address as Summit, split due to different company!)
  const deliveredAtDate = new Date(Date.now() - 30 * 60 * 1000);
  const drop4 = await prisma.drop.create({
    data: {
      companyId: verdantComp.id,
      deliveryDate: todayKolkataDate,
      deliveryTimeMinutes: 840,
      addressKey: addrVerdantHub.id,
      addressLine1Snapshot: addrVerdantHub.addressLine1,
      addressLine2Snapshot: addrVerdantHub.addressLine2,
      citySnapshot: addrVerdantHub.city,
      stateSnapshot: addrVerdantHub.state,
      postalCodeSnapshot: addrVerdantHub.postalCode,
      standingInstructionsSnapshot: verdantComp.driverInstructions,
      driverId: driverUser.id,
      status: DropStatus.DELIVERED,
      kitchenReadyAt: new Date(Date.now() - 120 * 60 * 1000),
      dispatchReadyAt: new Date(Date.now() - 110 * 60 * 1000),
      outForDeliveryAt: new Date(Date.now() - 60 * 60 * 1000),
      deliveredAt: deliveredAtDate,
      isOnTime: true,
      orders: {
        create: [
          { orderId: orderD005!.id },
        ],
      },
      deliveryRecord: {
        create: {
          deliveredAt: deliveredAtDate,
          note: 'Delivered to reception desk as instructed',
          photoUrl: 'https://images.fernleafkitchen.test/proofs/drop-d005-delivered.jpg',
        },
      },
    },
  });
  console.log(`  ✓ Drop 4 (Delivered with proof): ${drop4.id} [${drop4.status}] - Driver: ${driverUser.email}`);

  // 11. Seed Realistic Invoices for Phase 9 Billing
  console.log('Seeding Phase 9 invoices, invoice orders, and financial snapshots...');

  const orderB001 = await prisma.order.findUnique({ where: { orderNumber: 'FK-2026-B001' } });
  const orderB002 = await prisma.order.findUnique({ where: { orderNumber: 'FK-2026-B002' } });
  const orderB003 = await prisma.order.findUnique({ where: { orderNumber: 'FK-2026-B003' } });
  const orderB004 = await prisma.order.findUnique({ where: { orderNumber: 'FK-2026-B004' } });
  const orderB005 = await prisma.order.findUnique({ where: { orderNumber: 'FK-2026-B005' } });
  const orderB006 = await prisma.order.findUnique({ where: { orderNumber: 'FK-2026-B006' } });

  // 1. Unpaid Invoice (INV-2026-0001) for Apex Technologies Ltd with multiple confirmed orders
  const inv1TotalCents = (orderB003?.totalCents || 1800) + (orderB004?.totalCents || 2200);
  const inv1 = await prisma.invoice.create({
    data: {
      invoiceNumber: 'INV-2026-0001',
      companyId: apexComp.id,
      status: InvoiceStatus.ISSUED,
      totalCents: inv1TotalCents,
      notes: 'Weekly corporate meal program invoice',
      orders: {
        create: [
          { orderId: orderB003!.id, invoicedAmountCents: orderB003!.totalCents },
          { orderId: orderB004!.id, invoicedAmountCents: orderB004!.totalCents },
        ],
      },
    },
  });
  console.log(`  ✓ Invoice 1 (Unpaid, Multi-order): ${inv1.invoiceNumber} [${inv1.status}] - Total: ${inv1.totalCents}¢`);

  // 2. Paid Invoice (INV-2026-0002) for Verdant Eco Systems
  const inv2 = await prisma.invoice.create({
    data: {
      invoiceNumber: 'INV-2026-0002',
      companyId: verdantComp.id,
      status: InvoiceStatus.PAID,
      totalCents: orderB005!.totalCents,
      paidAt: new Date(Date.now() - 24 * 3600 * 1000),
      notes: 'Corporate catering invoice - Paid via NEFT bank transfer',
      orders: {
        create: [
          { orderId: orderB005!.id, invoicedAmountCents: orderB005!.totalCents },
        ],
      },
    },
  });
  console.log(`  ✓ Invoice 2 (Paid): ${inv2.invoiceNumber} [${inv2.status}] - Total: ${inv2.totalCents}¢ (Paid at: ${inv2.paidAt})`);

  // 3. Invoice with Mismatch (INV-2026-0003) for Apex Technologies Ltd
  // Invoiced at original amount (1600¢), then order total was updated later to 2000¢
  const inv3 = await prisma.invoice.create({
    data: {
      invoiceNumber: 'INV-2026-0003',
      companyId: apexComp.id,
      status: InvoiceStatus.ISSUED,
      totalCents: 1600,
      notes: 'Invoice created before admin line addition override',
      orders: {
        create: [
          { orderId: orderB006!.id, invoicedAmountCents: 1600 },
        ],
      },
    },
  });
  // Mutate orderB006's totalCents to 2000 to simulate post-invoice admin line override
  await prisma.order.update({
    where: { id: orderB006!.id },
    data: { totalCents: 2000 },
  });
  console.log(`  ✓ Invoice 3 (Mismatch Demonstration): ${inv3.invoiceNumber} [${inv3.status}] - Invoiced: 1600¢ vs Current Order: 2000¢ (Adjustment required)`);

  // Summit Health Innovations intentionally has confirmed uninvoiced orders: orderB001, orderB002
  console.log(`  ✓ Confirmed Uninvoiced Orders: ${orderB001!.orderNumber} (${orderB001!.totalCents}¢), ${orderB002!.orderNumber} (${orderB002!.totalCents}¢) for ${summitComp.name}`);

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
