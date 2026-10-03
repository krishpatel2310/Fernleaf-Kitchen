import { Test, TestingModule } from '@nestjs/testing';
import { CatalogueService } from './catalogue.service';
import { PrismaService } from '../prisma/prisma.service';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { Temperature } from '@prisma/client';

describe('CatalogueService - Domain Rules (Items 1 to 9)', () => {
  let service: CatalogueService;
  let prismaMock: any;

  beforeEach(async () => {
    prismaMock = {
      dish: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      dishAllergen: {
        createMany: jest.fn(),
        deleteMany: jest.fn(),
      },
      dishDietaryTag: {
        createMany: jest.fn(),
        deleteMany: jest.fn(),
      },
      dishOptionGroup: {
        createMany: jest.fn(),
        deleteMany: jest.fn(),
      },
      option: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      optionAllergen: {
        createMany: jest.fn(),
        deleteMany: jest.fn(),
      },
      optionDietaryTag: {
        createMany: jest.fn(),
        deleteMany: jest.fn(),
      },
      optionGroup: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      optionGroupOption: {
        createMany: jest.fn(),
        deleteMany: jest.fn(),
      },
      optionGroupPortion: {
        createMany: jest.fn(),
        deleteMany: jest.fn(),
      },
      allergen: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
      },
      dietaryTag: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
      },
      kitchenStation: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
      },
      packagingType: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
      },
      portionSize: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
      },
      $transaction: jest.fn((callback) => callback(prismaMock)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CatalogueService,
        {
          provide: PrismaService,
          useValue: prismaMock,
        },
      ],
    }).compile();

    service = module.get<CatalogueService>(CatalogueService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // 1. Create dish
  it('1. should create a valid dish with SKU and costPriceCents', async () => {
    prismaMock.dish.findUnique.mockResolvedValueOnce(null); // SKU unique check
    prismaMock.dish.create.mockResolvedValueOnce({
      id: 'dish-1',
      sku: 'DISH-PANEER-01',
      name: 'Paneer Butter Masala',
      temperature: Temperature.HOT,
      costPriceCents: 450,
      isActive: true,
    });
    prismaMock.dish.findUnique.mockResolvedValueOnce({
      id: 'dish-1',
      sku: 'DISH-PANEER-01',
      name: 'Paneer Butter Masala',
      temperature: Temperature.HOT,
      costPriceCents: 450,
      isActive: true,
      allergens: [],
      dietaryTags: [],
      optionGroups: [],
    });

    const res = await service.createDish({
      sku: 'DISH-PANEER-01',
      name: 'Paneer Butter Masala',
      temperature: Temperature.HOT,
      costPriceCents: 450,
    });

    expect(res?.sku).toBe('DISH-PANEER-01');
    expect(res?.costPriceCents).toBe(450);
  });

  // 2. Update dish
  it('2. should update dish details and synchronize relations', async () => {
    prismaMock.dish.findUnique.mockResolvedValueOnce({
      id: 'dish-1',
      sku: 'DISH-PANEER-01',
      name: 'Paneer Butter Masala',
      temperature: Temperature.HOT,
      costPriceCents: 450,
      isActive: true,
    });
    prismaMock.dish.update.mockResolvedValueOnce({
      id: 'dish-1',
      name: 'Paneer Makhani',
      costPriceCents: 480,
    });
    prismaMock.dish.findUnique.mockResolvedValueOnce({
      id: 'dish-1',
      name: 'Paneer Makhani',
      costPriceCents: 480,
      allergens: [],
      dietaryTags: [],
      optionGroups: [],
    });

    const res = await service.updateDish('dish-1', {
      name: 'Paneer Makhani',
      costPriceCents: 480,
    });

    expect(res?.name).toBe('Paneer Makhani');
    expect(prismaMock.dish.update).toHaveBeenCalled();
  });

  // 3. Deactivate dish
  it('3. should deactivate dish without deleting it', async () => {
    prismaMock.dish.findUnique.mockResolvedValueOnce({
      id: 'dish-1',
      isActive: true,
    });
    prismaMock.dish.update.mockResolvedValueOnce({
      id: 'dish-1',
      isActive: false,
    });

    const res = await service.setDishActive('dish-1', false);

    expect(res.isActive).toBe(false);
    expect(prismaMock.dish.update).toHaveBeenCalledWith({
      where: { id: 'dish-1' },
      data: { isActive: false },
    });
  });

  // 4. Deactivated dish cannot be treated as active
  it('4. deactivated dish is excluded when querying active dishes', async () => {
    prismaMock.dish.count.mockResolvedValueOnce(0);
    prismaMock.dish.findMany.mockResolvedValueOnce([]);

    const res = await service.findAllDishes({ includeInactive: false });

    expect(prismaMock.dish.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ isActive: true }),
      }),
    );
    expect(res.data).toEqual([]);
  });

  // 5. Create option
  it('5. should create reusable option with cost price', async () => {
    prismaMock.option.create.mockResolvedValueOnce({
      id: 'opt-1',
      name: 'Extra Gravy',
      costPriceCents: 50,
      isActive: true,
    });
    prismaMock.option.findUnique.mockResolvedValueOnce({
      id: 'opt-1',
      name: 'Extra Gravy',
      costPriceCents: 50,
      isActive: true,
      allergens: [],
      dietaryTags: [],
    });

    const res = await service.createOption({
      name: 'Extra Gravy',
      costPriceCents: 50,
    });

    expect(res?.name).toBe('Extra Gravy');
    expect(res?.costPriceCents).toBe(50);
  });

  // 6. Create option group
  it('6. should create option group with options and ordering', async () => {
    prismaMock.option.count.mockResolvedValueOnce(2);
    prismaMock.optionGroup.create.mockResolvedValueOnce({
      id: 'group-1',
      name: 'Spice Level',
      isRequired: true,
      displayOrder: 1,
      usesPortions: false,
    });
    prismaMock.optionGroup.findUnique.mockResolvedValueOnce({
      id: 'group-1',
      name: 'Spice Level',
      isRequired: true,
      displayOrder: 1,
      usesPortions: false,
      options: [],
      portions: [],
    });

    const res = await service.createOptionGroup({
      name: 'Spice Level',
      isRequired: true,
      displayOrder: 1,
      usesPortions: false,
      options: [
        { optionId: 'opt-mild', displayOrder: 0 },
        { optionId: 'opt-spicy', displayOrder: 1 },
      ],
    });

    expect(res?.name).toBe('Spice Level');
    expect(prismaMock.optionGroupOption.createMany).toHaveBeenCalled();
  });

  // 7. Required vs optional group
  it('7. should distinguish required and optional groups correctly', async () => {
    prismaMock.optionGroup.create.mockResolvedValueOnce({
      id: 'group-opt',
      name: 'Optional Add-ons',
      isRequired: false,
      displayOrder: 2,
    });
    prismaMock.optionGroup.findUnique.mockResolvedValueOnce({
      id: 'group-opt',
      name: 'Optional Add-ons',
      isRequired: false,
      displayOrder: 2,
      options: [],
      portions: [],
    });

    const res = await service.createOptionGroup({
      name: 'Optional Add-ons',
      isRequired: false,
    });

    expect(res?.isRequired).toBe(false);
  });

  // 8. Portion-aware group
  it('8. should support portion-aware group with portion sizes and extra pricing', async () => {
    prismaMock.portionSize.count.mockResolvedValueOnce(2);
    prismaMock.optionGroup.create.mockResolvedValueOnce({
      id: 'group-portion',
      name: 'Salad Dressing Size',
      usesPortions: true,
    });
    prismaMock.optionGroup.findUnique.mockResolvedValueOnce({
      id: 'group-portion',
      name: 'Salad Dressing Size',
      usesPortions: true,
      options: [],
      portions: [],
    });

    const res = await service.createOptionGroup({
      name: 'Salad Dressing Size',
      usesPortions: true,
      portions: [
        { portionSizeId: 'size-small', displayOrder: 0, extraPriceCents: 0 },
        { portionSizeId: 'size-large', displayOrder: 1, extraPriceCents: 150 },
      ],
    });

    expect(res?.usesPortions).toBe(true);
    expect(prismaMock.optionGroupPortion.createMany).toHaveBeenCalledWith({
      data: [
        {
          optionGroupId: 'group-portion',
          portionSizeId: 'size-small',
          displayOrder: 0,
          extraPriceCents: 0,
        },
        {
          optionGroupId: 'group-portion',
          portionSizeId: 'size-large',
          displayOrder: 1,
          extraPriceCents: 150,
        },
      ],
    });
  });

  // 9. Invalid references rejected
  it('9. should reject duplicate SKU or invalid allergen/station references', async () => {
    // Duplicate SKU
    prismaMock.dish.findUnique.mockResolvedValueOnce({
      id: 'existing-dish',
      sku: 'DUPLICATE-SKU',
    });

    await expect(
      service.createDish({
        sku: 'DUPLICATE-SKU',
        name: 'Duplicate Dish',
        temperature: Temperature.HOT,
        costPriceCents: 300,
      }),
    ).rejects.toThrow(ConflictException);

    // Invalid kitchen station
    prismaMock.dish.findUnique.mockResolvedValueOnce(null);
    prismaMock.kitchenStation.findUnique.mockResolvedValueOnce(null);

    await expect(
      service.createDish({
        sku: 'VALID-SKU',
        name: 'Valid Dish',
        temperature: Temperature.COLD,
        costPriceCents: 300,
        kitchenStationId: 'bad-station-id',
      }),
    ).rejects.toThrow(BadRequestException);
  });
});
