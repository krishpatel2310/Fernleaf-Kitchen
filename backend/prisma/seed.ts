import { PrismaClient, UserStatus, DayOfWeek, Temperature } from '@prisma/client';
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

  const dishSalad = await prisma.dish.upsert({
    where: { sku: 'SKU-SMK-SALAD' },
    update: {
      name: 'Smoked Chicken Salad',
      temperature: Temperature.COLD,
      costPriceCents: 450,
      isActive: true,
    },
    create: {
      sku: 'SKU-SMK-SALAD',
      name: 'Smoked Chicken Salad',
      description: 'Oak-smoked chicken breast over dressed microgreens',
      temperature: Temperature.COLD,
      costPriceCents: 450,
      isActive: true,
    },
  });

  const dishBowl = await prisma.dish.upsert({
    where: { sku: 'SKU-PNR-BOWL' },
    update: {
      name: 'Paneer Tikka Meal Bowl',
      temperature: Temperature.HOT,
      costPriceCents: 380,
      isActive: true,
    },
    create: {
      sku: 'SKU-PNR-BOWL',
      name: 'Paneer Tikka Meal Bowl',
      description:
        'Char-grilled cottage cheese cubes with cumin brown rice and mint chutney',
      temperature: Temperature.HOT,
      costPriceCents: 380,
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
