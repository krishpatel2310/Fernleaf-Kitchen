import { Test, TestingModule } from '@nestjs/testing';
import { OrdersService } from './orders.service';
import { PrismaService } from '../prisma/prisma.service';
import { PricingService } from '../pricing/pricing.service';
import { MenuService } from '../menu/menu.service';
import { CompaniesService } from '../companies/companies.service';
import { CutoffService } from './cutoff.service';
import { BadRequestException } from '@nestjs/common';
import { OrderEventType, OrderStatus } from '@prisma/client';

describe('OrdersService - Comprehensive Domain Logic (Groups A-H, J, K)', () => {
  let service: OrdersService;
  let prismaMock: any;
  let pricingServiceMock: any;
  let menuServiceMock: any;
  let companiesServiceMock: any;
  let cutoffServiceMock: any;

  const mockEmployee = {
    id: 'emp-1',
    firstName: 'Priya',
    lastName: 'Patel',
    email: 'priya@apextech.io',
    isActive: true,
    companyId: 'comp-apex',
    canChooseDeliveryAddress: true,
    canChangeDeliveryTime: true,
    canChangePackaging: true,
    defaultDeliveryAddressId: 'addr-hq',
    defaultDeliveryTimeMinutes: 750,
    defaultPackagingTypeId: 'pkg-eco',
    company: {
      id: 'comp-apex',
      name: 'Apex Technologies',
      priceTierId: 'tier-gold',
      deliveryMinutesBefore: 45,
      defaultDeliveryTimeMinutes: 750,
      defaultPackagingTypeId: 'pkg-eco',
      driverInstructions: 'Security check at Gate 2',
      addresses: [
        {
          id: 'addr-hq',
          label: 'Apex HQ',
          addressLine1: 'Outer Ring Rd',
          city: 'Bangalore',
          state: 'KA',
          postalCode: '560103',
          isActive: true,
        },
        {
          id: 'addr-campus',
          label: 'Apex Campus',
          addressLine1: 'Whitefield',
          city: 'Bangalore',
          state: 'KA',
          postalCode: '560066',
          isActive: true,
        },
      ],
      hiddenDishes: [],
      hiddenCategories: [],
    },
  };

  const mockDish = {
    id: 'dish-salad',
    sku: 'SKU-SALAD',
    name: 'Smoked Chicken Salad',
    isActive: true,
    costPriceCents: 450,
    minimumOrderQuantity: 5,
    categoryItems: [
      {
        categoryId: 'cat-salads',
        isActive: true,
        category: { id: 'cat-salads', isActive: true, name: 'Salads' },
      },
    ],
    optionGroups: [
      {
        dishId: 'dish-salad',
        optionGroupId: 'grp-dressing',
        optionGroup: {
          id: 'grp-dressing',
          name: 'Dressing Choice',
          isRequired: true,
          isActive: true,
          usesPortions: false,
          options: [
            {
              optionId: 'opt-vinaigrette',
              option: {
                id: 'opt-vinaigrette',
                name: 'Balsamic Vinaigrette',
                isActive: true,
              },
            },
            {
              optionId: 'opt-ranch',
              option: { id: 'opt-ranch', name: 'Herbed Ranch', isActive: true },
            },
          ],
          portions: [],
        },
      },
      {
        dishId: 'dish-salad',
        optionGroupId: 'grp-topping',
        optionGroup: {
          id: 'grp-topping',
          name: 'Extra Topping',
          isRequired: false,
          isActive: true,
          usesPortions: true,
          options: [
            {
              optionId: 'opt-avocado',
              option: {
                id: 'opt-avocado',
                name: 'Fresh Avocado',
                isActive: true,
              },
            },
          ],
          portions: [
            {
              portionSizeId: 'portion-large',
              extraPriceCents: 50,
              portionSize: {
                id: 'portion-large',
                name: 'Double Scoop',
                isActive: true,
              },
            },
          ],
        },
      },
    ],
  };

  beforeEach(async () => {
    prismaMock = {
      order: {
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
      },
      orderLine: {
        create: jest.fn(),
        deleteMany: jest.fn(),
      },
      orderCombination: {
        create: jest.fn(),
      },
      combinationOption: {
        createMany: jest.fn(),
      },
      orderEvent: {
        create: jest.fn(),
        findMany: jest.fn(),
      },
      employee: {
        findUnique: jest.fn().mockResolvedValue(mockEmployee),
      },
      company: {
        findUnique: jest.fn().mockResolvedValue(mockEmployee.company),
      },
      dish: {
        findUnique: jest.fn().mockResolvedValue(mockDish),
      },
      packagingType: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'pkg-eco',
          name: 'Standard Eco Box',
          isActive: true,
        }),
      },
      priceTier: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ id: 'tier-default', name: 'Standard' }),
      },
      $transaction: jest.fn((cb) => cb(prismaMock)),
    };

    pricingServiceMock = {
      resolveDishPrice: jest.fn().mockResolvedValue({
        priceCents: 500, // $5.00
        isExplicit: true,
        isDerived: false,
      }),
      resolveOptionPrice: jest.fn().mockImplementation((optionId: string) => {
        if (optionId === 'opt-vinaigrette') return { priceCents: 0 };
        if (optionId === 'opt-ranch') return { priceCents: 25 };
        if (optionId === 'opt-avocado') return { priceCents: 100 };
        return null;
      }),
    };

    menuServiceMock = {};

    companiesServiceMock = {
      isDeliveryDay: jest.fn().mockResolvedValue({ canDeliver: true }),
    };

    cutoffServiceMock = {
      normalizeCalendarDate: jest
        .fn()
        .mockImplementation((d) => new Date(`${d}T00:00:00.000Z`)),
      combineDateAndTimeInTimezone: jest
        .fn()
        .mockImplementation(
          (d, m) => new Date(d.getTime() + m * 60 * 1000 - 330 * 60 * 1000),
        ),
      calculateOrderCutoff: jest.fn().mockResolvedValue({
        cutoffDateTime: new Date('2026-10-05T10:30:00.000Z'), // Far in future for test
      }),
      isCutoffPassed: jest.fn().mockResolvedValue(false),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrdersService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: PricingService, useValue: pricingServiceMock },
        { provide: MenuService, useValue: menuServiceMock },
        { provide: CompaniesService, useValue: companiesServiceMock },
        { provide: CutoffService, useValue: cutoffServiceMock },
      ],
    }).compile();

    service = module.get<OrdersService>(OrdersService);
  });

  // ===========================================================================
  // GROUP A: Order Creation
  // ===========================================================================

  it('A1. creates a valid order with combinations, options, snapshots, and planned timing', async () => {
    prismaMock.order.create.mockResolvedValueOnce({
      id: 'order-1',
      orderNumber: 'FK-2026-0001',
      status: OrderStatus.PLACED,
      totalCents: 2600,
    });
    prismaMock.orderLine.create.mockResolvedValueOnce({ id: 'line-1' });
    prismaMock.orderCombination.create.mockResolvedValue({ id: 'combo-1' });
    prismaMock.order.findUnique.mockResolvedValueOnce({
      id: 'order-1',
      orderNumber: 'FK-2026-0001',
      status: OrderStatus.PLACED,
      totalCents: 2600,
    });

    const result = await service.create({
      employeeId: 'emp-1',
      deliveryDate: '2026-10-07',
      deliveryTimeMinutes: 750,
      companyAddressId: 'addr-hq',
      packagingTypeId: 'pkg-eco',
      isPlaced: true,
      lines: [
        {
          dishId: 'dish-salad',
          quantity: 5, // Meets MOQ of 5
          combinations: [
            {
              quantity: 2,
              options: [
                {
                  optionGroupId: 'grp-dressing',
                  optionId: 'opt-vinaigrette',
                },
              ],
            },
            {
              quantity: 3,
              options: [
                { optionGroupId: 'grp-dressing', optionId: 'opt-ranch' },
                {
                  optionGroupId: 'grp-topping',
                  optionId: 'opt-avocado',
                  portionSizeId: 'portion-large',
                },
              ],
            },
          ],
        },
      ],
    });

    expect(result).toBeDefined();
    expect(prismaMock.order.create).toHaveBeenCalled();
    expect(prismaMock.orderEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: OrderEventType.ORDER_PLACED,
        }),
      }),
    );
  });

  it('A2. rejects inactive dish', async () => {
    prismaMock.dish.findUnique.mockResolvedValueOnce({
      ...mockDish,
      isActive: false,
    });

    await expect(
      service.create({
        employeeId: 'emp-1',
        deliveryDate: '2026-10-07',
        lines: [{ dishId: 'dish-salad', quantity: 5 }],
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('A3. rejects company-hidden dish', async () => {
    prismaMock.company.findUnique.mockResolvedValueOnce({
      ...mockEmployee.company,
      hiddenDishes: [{ dishId: 'dish-salad' }],
    });

    await expect(
      service.create({
        employeeId: 'emp-1',
        deliveryDate: '2026-10-07',
        lines: [{ dishId: 'dish-salad', quantity: 5 }],
      }),
    ).rejects.toThrow(BadRequestException);
  });

  // ===========================================================================
  // GROUP B: Combination Counting & Normalization
  // ===========================================================================

  it('B1. rejects order line where combination quantities do not sum to dish quantity (too few)', async () => {
    await expect(
      service.create({
        employeeId: 'emp-1',
        deliveryDate: '2026-10-07',
        lines: [
          {
            dishId: 'dish-salad',
            quantity: 5,
            combinations: [
              {
                quantity: 2,
                options: [
                  {
                    optionGroupId: 'grp-dressing',
                    optionId: 'opt-vinaigrette',
                  },
                ],
              },
              {
                quantity: 2, // Total = 4 != 5
                options: [
                  { optionGroupId: 'grp-dressing', optionId: 'opt-ranch' },
                ],
              },
            ],
          },
        ],
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('B2. rejects order line where combination quantities exceed dish quantity (too many)', async () => {
    await expect(
      service.create({
        employeeId: 'emp-1',
        deliveryDate: '2026-10-07',
        lines: [
          {
            dishId: 'dish-salad',
            quantity: 5,
            combinations: [
              {
                quantity: 3,
                options: [
                  {
                    optionGroupId: 'grp-dressing',
                    optionId: 'opt-vinaigrette',
                  },
                ],
              },
              {
                quantity: 3, // Total = 6 > 5
                options: [
                  { optionGroupId: 'grp-dressing', optionId: 'opt-ranch' },
                ],
              },
            ],
          },
        ],
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('B3. normalizes identical combinations into one combination with summed quantity', async () => {
    prismaMock.order.create.mockResolvedValueOnce({
      id: 'order-norm',
      totalCents: 2500,
    });
    prismaMock.orderLine.create.mockResolvedValueOnce({ id: 'line-norm' });
    prismaMock.orderCombination.create.mockResolvedValue({ id: 'combo-norm' });
    prismaMock.order.findUnique.mockResolvedValueOnce({ id: 'order-norm' });

    await service.create({
      employeeId: 'emp-1',
      deliveryDate: '2026-10-07',
      lines: [
        {
          dishId: 'dish-salad',
          quantity: 5,
          combinations: [
            {
              quantity: 2,
              options: [
                {
                  optionGroupId: 'grp-dressing',
                  optionId: 'opt-vinaigrette',
                },
              ],
            },
            {
              quantity: 3,
              // Identical options to previous combination!
              options: [
                {
                  optionGroupId: 'grp-dressing',
                  optionId: 'opt-vinaigrette',
                },
              ],
            },
          ],
        },
      ],
    });

    // Should create exactly 1 merged combination with quantity = 5
    expect(prismaMock.orderCombination.create).toHaveBeenCalledTimes(1);
    expect(prismaMock.orderCombination.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          quantity: 5,
        }),
      }),
    );
  });

  // ===========================================================================
  // GROUP C: Required Option Groups
  // ===========================================================================

  it('C1. rejects combination missing a required option group', async () => {
    await expect(
      service.create({
        employeeId: 'emp-1',
        deliveryDate: '2026-10-07',
        lines: [
          {
            dishId: 'dish-salad',
            quantity: 5,
            combinations: [
              {
                quantity: 5,
                // Omitted required 'grp-dressing'!
                options: [
                  {
                    optionGroupId: 'grp-topping',
                    optionId: 'opt-avocado',
                  },
                ],
              },
            ],
          },
        ],
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('C2. accepts combination where optional group is omitted', async () => {
    prismaMock.order.create.mockResolvedValueOnce({ id: 'order-opt' });
    prismaMock.orderLine.create.mockResolvedValueOnce({ id: 'line-opt' });
    prismaMock.orderCombination.create.mockResolvedValue({ id: 'combo-opt' });
    prismaMock.order.findUnique.mockResolvedValueOnce({ id: 'order-opt' });

    // grp-topping is optional and omitted
    const res = await service.create({
      employeeId: 'emp-1',
      deliveryDate: '2026-10-07',
      lines: [
        {
          dishId: 'dish-salad',
          quantity: 5,
          combinations: [
            {
              quantity: 5,
              options: [
                {
                  optionGroupId: 'grp-dressing',
                  optionId: 'opt-vinaigrette',
                },
              ],
            },
          ],
        },
      ],
    });

    expect(res).toBeDefined();
  });

  // ===========================================================================
  // GROUP D: Minimum Order Quantity (MOQ)
  // ===========================================================================

  it('D1. rejects order line if total dish quantity is below MOQ', async () => {
    // mockDish MOQ is 5, but only 3 requested
    await expect(
      service.create({
        employeeId: 'emp-1',
        deliveryDate: '2026-10-07',
        lines: [
          {
            dishId: 'dish-salad',
            quantity: 3,
            combinations: [
              {
                quantity: 3,
                options: [
                  {
                    optionGroupId: 'grp-dressing',
                    optionId: 'opt-vinaigrette',
                  },
                ],
              },
            ],
          },
        ],
      }),
    ).rejects.toThrow(BadRequestException);
  });

  // ===========================================================================
  // GROUP E: Pricing & Historical Immutability
  // ===========================================================================

  it('E1. calculates integer cents accurately: (dish + option + portion) * quantity', async () => {
    prismaMock.order.create.mockResolvedValueOnce({ id: 'order-price' });
    prismaMock.orderLine.create.mockResolvedValueOnce({ id: 'line-price' });
    prismaMock.orderCombination.create.mockResolvedValue({ id: 'combo-price' });
    prismaMock.order.findUnique.mockResolvedValueOnce({ id: 'order-price' });

    // dish: 500 cents
    // ranch option: 25 cents
    // avocado option: 100 cents + double scoop portion: 50 cents
    // combo unit price = 500 + 25 + 100 + 50 = 675 cents ($6.75)
    // total for 5 units = 675 * 5 = 3375 cents ($33.75)
    await service.create({
      employeeId: 'emp-1',
      deliveryDate: '2026-10-07',
      lines: [
        {
          dishId: 'dish-salad',
          quantity: 5,
          combinations: [
            {
              quantity: 5,
              options: [
                { optionGroupId: 'grp-dressing', optionId: 'opt-ranch' },
                {
                  optionGroupId: 'grp-topping',
                  optionId: 'opt-avocado',
                  portionSizeId: 'portion-large',
                },
              ],
            },
          ],
        },
      ],
    });

    expect(prismaMock.order.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          totalCents: 3375,
        }),
      }),
    );

    expect(prismaMock.orderCombination.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          unitPriceCents: 675,
          combinationTotalCents: 3375,
        }),
      }),
    );
  });

  it('E2. rejects order if dish price cannot be resolved', async () => {
    pricingServiceMock.resolveDishPrice.mockResolvedValueOnce(null);

    await expect(
      service.create({
        employeeId: 'emp-1',
        deliveryDate: '2026-10-07',
        lines: [{ dishId: 'dish-salad', quantity: 5 }],
      }),
    ).rejects.toThrow(BadRequestException);
  });

  // ===========================================================================
  // GROUP F: Delivery & Company Calendar
  // ===========================================================================

  it('F1. rejects order on company holiday or non-delivery day', async () => {
    companiesServiceMock.isDeliveryDay.mockResolvedValueOnce({
      canDeliver: false,
      reason: 'Company holiday: Republic Day',
    });

    await expect(
      service.create({
        employeeId: 'emp-1',
        deliveryDate: '2026-01-26',
        lines: [{ dishId: 'dish-salad', quantity: 5 }],
      }),
    ).rejects.toThrow(BadRequestException);
  });

  // ===========================================================================
  // GROUP G: Employee Permissions
  // ===========================================================================

  it('G1. rejects changing delivery address if employee permission canChooseDeliveryAddress is false', async () => {
    prismaMock.employee.findUnique.mockResolvedValueOnce({
      ...mockEmployee,
      canChooseDeliveryAddress: false,
      defaultDeliveryAddressId: 'addr-hq',
    });

    await expect(
      service.create({
        employeeId: 'emp-1',
        deliveryDate: '2026-10-07',
        companyAddressId: 'addr-campus', // Different from default
        lines: [{ dishId: 'dish-salad', quantity: 5 }],
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('G2. rejects changing delivery time if employee permission canChangeDeliveryTime is false', async () => {
    prismaMock.employee.findUnique.mockResolvedValueOnce({
      ...mockEmployee,
      canChangeDeliveryTime: false,
      defaultDeliveryTimeMinutes: 750,
    });

    await expect(
      service.create({
        employeeId: 'emp-1',
        deliveryDate: '2026-10-07',
        deliveryTimeMinutes: 800, // Different from default 750
        lines: [{ dishId: 'dish-salad', quantity: 5 }],
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('G3. rejects changing packaging if employee permission canChangePackaging is false', async () => {
    prismaMock.employee.findUnique.mockResolvedValueOnce({
      ...mockEmployee,
      canChangePackaging: false,
      defaultPackagingTypeId: 'pkg-eco',
    });

    await expect(
      service.create({
        employeeId: 'emp-1',
        deliveryDate: '2026-10-07',
        packagingTypeId: 'pkg-bento', // Different from default pkg-eco
        lines: [{ dishId: 'dish-salad', quantity: 5 }],
      }),
    ).rejects.toThrow(BadRequestException);
  });

  // ===========================================================================
  // GROUP H: Historical Company Safety
  // ===========================================================================

  it('H1. order stores historical companyId snapshot that remains unaffected by employee movement', async () => {
    prismaMock.order.create.mockResolvedValueOnce({ id: 'order-hist' });
    prismaMock.orderLine.create.mockResolvedValueOnce({ id: 'line-hist' });
    prismaMock.orderCombination.create.mockResolvedValue({ id: 'combo-hist' });
    prismaMock.order.findUnique.mockResolvedValueOnce({ id: 'order-hist' });

    await service.create({
      employeeId: 'emp-1',
      deliveryDate: '2026-10-07',
      lines: [
        {
          dishId: 'dish-salad',
          quantity: 5,
          combinations: [
            {
              quantity: 5,
              options: [
                {
                  optionGroupId: 'grp-dressing',
                  optionId: 'opt-vinaigrette',
                },
              ],
            },
          ],
        },
      ],
    });

    expect(prismaMock.order.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          companyId: 'comp-apex', // Snapshot of employee company at creation
        }),
      }),
    );
  });

  // ===========================================================================
  // GROUP J: Cutoff Processing & Idempotency
  // ===========================================================================

  it('J1. transitions PLACED -> CONFIRMED and DRAFT -> CANCELLED when cutoff has passed', async () => {
    const referenceTime = new Date('2026-10-06T00:00:00.000Z');

    prismaMock.order.findMany.mockResolvedValueOnce([
      {
        id: 'ord-placed',
        orderNumber: 'FK-2026-0001',
        status: OrderStatus.PLACED,
        deliveryDate: new Date('2026-10-05T00:00:00.000Z'),
      },
      {
        id: 'ord-draft',
        orderNumber: 'FK-2026-0002',
        status: OrderStatus.DRAFT,
        deliveryDate: new Date('2026-10-05T00:00:00.000Z'),
      },
    ]);

    // Cutoff passed for both orders
    cutoffServiceMock.calculateOrderCutoff.mockResolvedValue({
      cutoffDateTime: new Date('2026-10-01T10:30:00.000Z'),
    });

    prismaMock.order.updateMany
      .mockResolvedValueOnce({ count: 1 }) // placed -> confirmed
      .mockResolvedValueOnce({ count: 1 }); // draft -> cancelled

    const result = await service.processCutoffs(referenceTime);

    expect(result.examinedCount).toBe(2);
    expect(result.confirmedCount).toBe(1);
    expect(result.cancelledDraftsCount).toBe(1);
    expect(prismaMock.orderEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: OrderEventType.ORDER_CONFIRMED,
        }),
      }),
    );
    expect(prismaMock.orderEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: OrderEventType.ORDER_CANCELLED,
        }),
      }),
    );
  });

  it('J2. repeated execution is idempotent and produces no duplicate events', async () => {
    const referenceTime = new Date('2026-10-06T00:00:00.000Z');

    prismaMock.order.findMany.mockResolvedValueOnce([
      {
        id: 'ord-placed',
        orderNumber: 'FK-2026-0001',
        status: OrderStatus.PLACED,
        deliveryDate: new Date('2026-10-05T00:00:00.000Z'),
      },
    ]);

    cutoffServiceMock.calculateOrderCutoff.mockResolvedValue({
      cutoffDateTime: new Date('2026-10-01T10:30:00.000Z'),
    });

    // Already updated by concurrent process (count = 0)
    prismaMock.order.updateMany.mockResolvedValueOnce({ count: 0 });

    const result = await service.processCutoffs(referenceTime);

    expect(result.confirmedCount).toBe(0);
    expect(result.skippedCount).toBe(1);
    expect(prismaMock.orderEvent.create).not.toHaveBeenCalled();
  });

  // ===========================================================================
  // GROUP K: Admin Overrides
  // ===========================================================================

  it('K1. allows admin override of delivery details and records ADMIN_OVERRIDE event', async () => {
    prismaMock.order.findUnique.mockResolvedValueOnce({
      id: 'ord-conf',
      orderNumber: 'FK-2026-0001',
      status: OrderStatus.CONFIRMED,
      deliveryTimeMinutes: 720,
      packagingTypeId: 'pkg-eco',
      deliveryDate: new Date('2026-10-07T00:00:00.000Z'),
      company: mockEmployee.company,
      delivery: {
        companyAddressId: 'addr-hq',
        addressLabelSnapshot: 'Apex HQ',
        deliveryTimeMinutes: 720,
      },
    });

    prismaMock.order.update.mockResolvedValueOnce({ id: 'ord-conf' });

    await service.adminOverride(
      'ord-conf',
      {
        deliveryAddressId: 'addr-campus',
        deliveryTimeMinutes: 780,
        note: 'Customer requested delivery to Whitefield campus at 1:00 PM',
      },
      'admin-user-id',
    );

    expect(prismaMock.order.update).toHaveBeenCalled();
    expect(prismaMock.orderEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: OrderEventType.ADMIN_OVERRIDE,
          userId: 'admin-user-id',
          note: 'Customer requested delivery to Whitefield campus at 1:00 PM',
        }),
      }),
    );
  });
});
