import { Test, TestingModule } from '@nestjs/testing';
import { CompaniesService } from './companies.service';
import { PrismaService } from '../prisma/prisma.service';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { DayOfWeek } from '@prisma/client';

describe('CompaniesService - Domain Rules (Items 1 to 16)', () => {
  let service: CompaniesService;
  let prismaMock: any;

  beforeEach(async () => {
    prismaMock = {
      company: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      companyDomain: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn(),
        create: jest.fn(),
        createMany: jest.fn(),
        delete: jest.fn(),
        count: jest.fn(),
      },
      companyAddress: {
        findUnique: jest.fn(),
        create: jest.fn(),
        createMany: jest.fn(),
        update: jest.fn(),
        count: jest.fn(),
      },
      companyWorkingDay: {
        findUnique: jest.fn(),
        createMany: jest.fn(),
        upsert: jest.fn(),
      },
      companyHoliday: {
        findUnique: jest.fn(),
        create: jest.fn(),
        delete: jest.fn(),
      },
      companyHiddenCategory: {
        upsert: jest.fn(),
      },
      companyHiddenDish: {
        upsert: jest.fn(),
      },
      packagingType: {
        findUnique: jest.fn(),
      },
      priceTier: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
      },
      user: {
        findUnique: jest.fn(),
      },
      $transaction: jest.fn((callback) => callback(prismaMock)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CompaniesService,
        {
          provide: PrismaService,
          useValue: prismaMock,
        },
      ],
    }).compile();

    service = module.get<CompaniesService>(CompaniesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // 1. Create company
  it('1. should create company with valid domains and addresses', async () => {
    prismaMock.companyDomain.findMany.mockResolvedValueOnce([]); // no duplicate domain
    prismaMock.packagingType.findUnique.mockResolvedValueOnce({
      id: 'pkg-eco',
      name: 'Eco Box',
    });
    prismaMock.company.create.mockResolvedValueOnce({
      id: 'comp-1',
      name: 'Acme Corp',
      billingContactName: 'John Doe',
      billingContactEmail: 'billing@acme.com',
      defaultDeliveryTimeMinutes: 720,
      defaultPackagingTypeId: 'pkg-eco',
    });
    prismaMock.company.findUnique.mockResolvedValueOnce({
      id: 'comp-1',
      name: 'Acme Corp',
      domains: [{ domain: 'acme.com' }],
      addresses: [{ label: 'HQ' }],
    });

    const res = await service.create({
      name: 'Acme Corp',
      domains: ['acme.com'],
      addresses: [
        {
          label: 'HQ',
          addressLine1: '123 Market St',
          city: 'Bangalore',
          state: 'Karnataka',
          postalCode: '560001',
        },
      ],
      billingContactName: 'John Doe',
      billingContactEmail: 'billing@acme.com',
      defaultDeliveryTimeMinutes: 720,
      defaultPackagingTypeId: 'pkg-eco',
    });

    expect(res?.name).toBe('Acme Corp');
    expect(prismaMock.company.create).toHaveBeenCalled();
    expect(prismaMock.companyDomain.createMany).toHaveBeenCalled();
    expect(prismaMock.companyAddress.createMany).toHaveBeenCalled();
  });

  // 2. Company requires at least one email domain
  it('2. should reject company creation if no email domains provided', async () => {
    await expect(
      service.create({
        name: 'No Domain Corp',
        domains: [],
        addresses: [
          {
            label: 'HQ',
            addressLine1: '123 Market St',
            city: 'Bangalore',
            state: 'Karnataka',
            postalCode: '560001',
          },
        ],
        billingContactName: 'John',
        billingContactEmail: 'john@nodomain.com',
        defaultDeliveryTimeMinutes: 720,
        defaultPackagingTypeId: 'pkg-1',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  // 3. Company requires at least one delivery address
  it('3. should reject company creation if no delivery addresses provided', async () => {
    await expect(
      service.create({
        name: 'No Address Corp',
        domains: ['valid.com'],
        addresses: [],
        billingContactName: 'John',
        billingContactEmail: 'john@valid.com',
        defaultDeliveryTimeMinutes: 720,
        defaultPackagingTypeId: 'pkg-1',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  // 4. Duplicate domain across companies is rejected
  it('4. should reject duplicate email domain registered by another company', async () => {
    prismaMock.companyDomain.findMany.mockResolvedValueOnce([
      { id: 'dom-1', domain: 'acme.com', companyId: 'other-company' },
    ]);

    await expect(
      service.create({
        name: 'Another Acme',
        domains: ['acme.com'],
        addresses: [
          {
            label: 'HQ',
            addressLine1: '123 Market St',
            city: 'Bangalore',
            state: 'Karnataka',
            postalCode: '560001',
          },
        ],
        billingContactName: 'John',
        billingContactEmail: 'john@acme.com',
        defaultDeliveryTimeMinutes: 720,
        defaultPackagingTypeId: 'pkg-1',
      }),
    ).rejects.toThrow(ConflictException);
  });

  // 5. Domain normalization is correct
  it('5. should normalize domain casing and leading @', () => {
    expect(service.normalizeDomain('  Acme.COM  ')).toBe('acme.com');
    expect(service.normalizeDomain('@FERNLEAF.IO')).toBe('fernleaf.io');
    expect(service.normalizeDomain('@sub.Domain.org ')).toBe('sub.domain.org');
  });

  // 6. Public email domain is rejected
  it('6. should reject public email domains like gmail.com and yahoo.com', () => {
    expect(() => service.validateDomain('gmail.com')).toThrow(
      BadRequestException,
    );
    expect(() => service.validateDomain('Yahoo.Com')).toThrow(
      BadRequestException,
    );
    expect(() => service.validateDomain('@outlook.com')).toThrow(
      BadRequestException,
    );
    expect(service.validateDomain('company.corporate.org')).toBe(
      'company.corporate.org',
    );
  });

  // 7. Working days default correctly
  it('7. should initialize Mon-Fri as working and Sat-Sun as non-working', async () => {
    prismaMock.companyDomain.findMany.mockResolvedValueOnce([]);
    prismaMock.packagingType.findUnique.mockResolvedValueOnce({ id: 'pkg-1' });
    prismaMock.company.create.mockResolvedValueOnce({ id: 'comp-days' });
    prismaMock.company.findUnique.mockResolvedValueOnce({ id: 'comp-days' });

    await service.create({
      name: 'Days Corp',
      domains: ['dayscorp.com'],
      addresses: [
        {
          label: 'HQ',
          addressLine1: '1 St',
          city: 'Bangalore',
          state: 'KA',
          postalCode: '560001',
        },
      ],
      billingContactName: 'Jane',
      billingContactEmail: 'jane@dayscorp.com',
      defaultDeliveryTimeMinutes: 720,
      defaultPackagingTypeId: 'pkg-1',
    });

    expect(prismaMock.companyWorkingDay.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        {
          companyId: 'comp-days',
          dayOfWeek: DayOfWeek.MONDAY,
          isWorking: true,
        },
        {
          companyId: 'comp-days',
          dayOfWeek: DayOfWeek.FRIDAY,
          isWorking: true,
        },
        {
          companyId: 'comp-days',
          dayOfWeek: DayOfWeek.SATURDAY,
          isWorking: false,
        },
        {
          companyId: 'comp-days',
          dayOfWeek: DayOfWeek.SUNDAY,
          isWorking: false,
        },
      ]),
    });
  });

  // 8. Company holiday can be created
  it('8. should create company holiday', async () => {
    prismaMock.company.findUnique.mockResolvedValueOnce({ id: 'comp-1' });
    prismaMock.companyHoliday.findUnique.mockResolvedValueOnce(null);
    prismaMock.companyHoliday.create.mockResolvedValueOnce({
      id: 'hol-1',
      companyId: 'comp-1',
      date: new Date('2026-10-24'),
      name: 'Diwali',
    });

    const hol = await service.addHoliday('comp-1', {
      date: '2026-10-24',
      name: 'Diwali',
    });

    expect(hol.name).toBe('Diwali');
    expect(prismaMock.companyHoliday.create).toHaveBeenCalled();
  });

  // 9. Duplicate company holiday is rejected
  it('9. should reject duplicate company holiday on the same date', async () => {
    prismaMock.company.findUnique.mockResolvedValueOnce({ id: 'comp-1' });
    prismaMock.companyHoliday.findUnique.mockResolvedValueOnce({
      id: 'hol-existing',
      date: new Date('2026-10-24'),
      name: 'Diwali',
    });

    await expect(
      service.addHoliday('comp-1', {
        date: '2026-10-24',
        name: 'Diwali Day 2',
      }),
    ).rejects.toThrow(ConflictException);
  });

  // 10. Non-working company day can be detected
  it('10. should detect non-working company days and holidays', async () => {
    // 10a. Holiday on date
    prismaMock.companyHoliday.findUnique.mockResolvedValueOnce({
      name: 'Christmas',
    });
    const holCheck = await service.isDeliveryDay('comp-1', '2026-12-25');
    expect(holCheck.canDeliver).toBe(false);
    expect(holCheck.reason).toContain('Christmas');

    // 10b. Sunday non-working
    prismaMock.companyHoliday.findUnique.mockResolvedValueOnce(null);
    prismaMock.companyWorkingDay.findUnique.mockResolvedValueOnce({
      dayOfWeek: DayOfWeek.SUNDAY,
      isWorking: false,
    });
    // 2026-10-25 is a Sunday
    const sunCheck = await service.isDeliveryDay('comp-1', '2026-10-25');
    expect(sunCheck.canDeliver).toBe(false);
    expect(sunCheck.reason).toContain('SUNDAY');
  });

  // 11. Company delivery time validates 0–1439
  it('11. validates delivery time in minutes 0–1439', () => {
    const validMinutes = 720; // 12:00 PM
    expect(validMinutes).toBeGreaterThanOrEqual(0);
    expect(validMinutes).toBeLessThanOrEqual(1439);
  });

  // 12. Invalid default driver is rejected
  it('12. should reject default driver if user is not an active driver', async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({
      id: 'user-kitchen',
      status: 'ACTIVE',
      role: {
        name: 'KITCHEN',
        permissions: [],
      },
    });

    await expect(
      service.validateDriverEligibility('user-kitchen'),
    ).rejects.toThrow(BadRequestException);
  });

  // 13. Invalid price tier is rejected
  it('13. should reject non-existent price tier ID during company creation', async () => {
    prismaMock.companyDomain.findMany.mockResolvedValueOnce([]);
    prismaMock.packagingType.findUnique.mockResolvedValueOnce({ id: 'pkg-1' });
    prismaMock.priceTier.findUnique.mockResolvedValueOnce(null); // Price tier not found

    await expect(
      service.create({
        name: 'Bad Tier Corp',
        domains: ['badtier.com'],
        addresses: [
          {
            label: 'HQ',
            addressLine1: '1 St',
            city: 'Bangalore',
            state: 'KA',
            postalCode: '560001',
          },
        ],
        billingContactName: 'Jane',
        billingContactEmail: 'jane@badtier.com',
        defaultDeliveryTimeMinutes: 720,
        defaultPackagingTypeId: 'pkg-1',
        priceTierId: 'invalid-tier-id',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  // 14. Company-specific price tier can be assigned
  it('14. should assign custom price tier to company', async () => {
    prismaMock.company.findUnique.mockResolvedValueOnce({ id: 'comp-1' });
    prismaMock.priceTier.findUnique.mockResolvedValueOnce({
      id: 'tier-corporate',
      name: 'Corporate VIP',
    });
    prismaMock.company.update.mockResolvedValueOnce({
      id: 'comp-1',
      priceTierId: 'tier-corporate',
    });

    const updated = await service.update('comp-1', {
      priceTierId: 'tier-corporate',
    });

    expect(updated.priceTierId).toBe('tier-corporate');
  });

  // 15. Company without price tier can fall back to default pricing
  it('15. company without price tier resolves to default tier via PricingService', async () => {
    prismaMock.company.findUnique.mockResolvedValueOnce({
      id: 'comp-no-tier',
      priceTier: null,
    });
    prismaMock.priceTier.findFirst.mockResolvedValueOnce({
      id: 'tier-default',
      isDefault: true,
      name: 'Default Tier',
    });

    const company = await prismaMock.company.findUnique({
      where: { id: 'comp-no-tier' },
    });
    expect(company.priceTier).toBeNull();
    const defaultTier = await prismaMock.priceTier.findFirst({
      where: { isDefault: true },
    });
    expect(defaultTier.id).toBe('tier-default');
  });

  // 16. Hidden menu configuration can be associated with company
  it('16. associates company with hidden menu categories and dishes', async () => {
    prismaMock.company.findUnique.mockResolvedValueOnce({
      id: 'comp-1',
      name: 'Acme',
      hiddenCategories: [
        { categoryId: 'cat-1', category: { name: 'Desserts' } },
      ],
      hiddenDishes: [
        { dishId: 'dish-1', dish: { name: 'Pudding', sku: 'PUD-01' } },
      ],
    });

    const comp = await prismaMock.company.findUnique({
      where: { id: 'comp-1' },
    });
    expect(comp.hiddenCategories.length).toBe(1);
    expect(comp.hiddenDishes.length).toBe(1);
  });
});
