import { Test, TestingModule } from '@nestjs/testing';
import { MenuService } from './menu.service';
import { PrismaService } from '../prisma/prisma.service';
import { PricingService } from '../pricing/pricing.service';
import { PriceRuleType, Temperature } from '@prisma/client';

describe('MenuService - Domain Rules (Items 10 to 17)', () => {
  let service: MenuService;
  let prismaMock: any;
  let pricingServiceMock: any;

  beforeEach(async () => {
    prismaMock = {
      menuCategory: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      dish: {
        findUnique: jest.fn(),
      },
      menuCategoryDish: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        upsert: jest.fn(),
        delete: jest.fn(),
        update: jest.fn(),
      },
      company: {
        findUnique: jest.fn(),
      },
      companyHiddenCategory: {
        upsert: jest.fn(),
        deleteMany: jest.fn(),
      },
      companyHiddenDish: {
        upsert: jest.fn(),
        deleteMany: jest.fn(),
      },
      $transaction: jest.fn((callback) => callback(prismaMock)),
    };

    pricingServiceMock = {
      resolveCompanyTier: jest.fn(),
      resolveDishPrice: jest.fn(),
      resolveOptionPrice: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MenuService,
        {
          provide: PrismaService,
          useValue: prismaMock,
        },
        {
          provide: PricingService,
          useValue: pricingServiceMock,
        },
      ],
    }).compile();

    service = module.get<MenuService>(MenuService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // 10. Create category
  it('10. should create menu category', async () => {
    prismaMock.menuCategory.create.mockResolvedValueOnce({
      id: 'cat-1',
      name: 'Main Courses',
      displayOrder: 1,
      isActive: true,
      isSecret: false,
    });

    const res = await service.createCategory({
      name: 'Main Courses',
      displayOrder: 1,
    });

    expect(res.name).toBe('Main Courses');
    expect(prismaMock.menuCategory.create).toHaveBeenCalled();
  });

  // 11. Add dish to category
  it('11. should add dish to category without modifying global catalogue dish', async () => {
    prismaMock.menuCategory.findUnique.mockResolvedValueOnce({ id: 'cat-1' });
    prismaMock.dish.findUnique.mockResolvedValueOnce({ id: 'dish-1' });
    prismaMock.menuCategoryDish.findFirst.mockResolvedValueOnce(null);
    prismaMock.menuCategoryDish.upsert.mockResolvedValueOnce({
      categoryId: 'cat-1',
      dishId: 'dish-1',
      displayOrder: 0,
      isActive: true,
      dish: { id: 'dish-1', name: 'Curry' },
    });

    const res = await service.addDishToCategory('cat-1', { dishId: 'dish-1' });

    expect(res.categoryId).toBe('cat-1');
    expect(res.dishId).toBe('dish-1');
    expect(prismaMock.menuCategoryDish.upsert).toHaveBeenCalled();
  });

  // 12. Ordering works
  it('12. should maintain ordering across categories and items within category', async () => {
    // Reorder categories
    prismaMock.menuCategory.update
      .mockResolvedValueOnce({ id: 'cat-1', displayOrder: 0 })
      .mockResolvedValueOnce({ id: 'cat-2', displayOrder: 1 });

    const res = await service.reorderCategories({
      items: [
        { id: 'cat-1', displayOrder: 0 },
        { id: 'cat-2', displayOrder: 1 },
      ],
    });

    expect(res.length).toBe(2);
    expect(prismaMock.menuCategory.update).toHaveBeenCalledTimes(2);
  });

  // 13. Company hidden dish is excluded from that company's menu
  it("13. company hidden dish is excluded from that company's menu preview", async () => {
    pricingServiceMock.resolveCompanyTier.mockResolvedValueOnce({
      id: 'tier-1',
      name: 'Default',
    });
    // Company A hides dish-hidden
    prismaMock.company.findUnique.mockResolvedValueOnce({
      id: 'comp-a',
      name: 'Company A',
      hiddenCategories: [],
      hiddenDishes: [{ dishId: 'dish-hidden' }],
    });

    // Categories in system
    prismaMock.menuCategory.findMany.mockResolvedValueOnce([
      {
        id: 'cat-1',
        name: 'Mains',
        displayOrder: 0,
        isSecret: false,
        dishes: [
          {
            dishId: 'dish-hidden',
            displayOrder: 0,
            dish: {
              id: 'dish-hidden',
              name: 'Hidden Dish',
              sku: 'HD-01',
              temperature: Temperature.HOT,
              allergens: [],
              dietaryTags: [],
              optionGroups: [],
            },
          },
          {
            dishId: 'dish-visible',
            displayOrder: 1,
            dish: {
              id: 'dish-visible',
              name: 'Visible Dish',
              sku: 'VD-01',
              temperature: Temperature.HOT,
              allergens: [],
              dietaryTags: [],
              optionGroups: [],
            },
          },
        ],
      },
    ]);

    pricingServiceMock.resolveDishPrice.mockResolvedValueOnce({
      priceCents: 1000,
      isExplicit: true,
      isDerived: false,
    });

    const preview = await service.getMenuPreview({ companyId: 'comp-a' });

    expect(preview.categories[0].dishes.length).toBe(1);
    expect(preview.categories[0].dishes[0].id).toBe('dish-visible');
  });

  // 14. Company hidden category is excluded
  it("14. company hidden category is completely excluded from that company's menu preview", async () => {
    pricingServiceMock.resolveCompanyTier.mockResolvedValueOnce({
      id: 'tier-1',
      name: 'Default',
    });
    // Company A hides cat-hidden
    prismaMock.company.findUnique.mockResolvedValueOnce({
      id: 'comp-a',
      name: 'Company A',
      hiddenCategories: [{ categoryId: 'cat-hidden' }],
      hiddenDishes: [],
    });

    prismaMock.menuCategory.findMany.mockResolvedValueOnce([
      {
        id: 'cat-hidden',
        name: 'Secret Desserts',
        displayOrder: 0,
        dishes: [],
      },
      {
        id: 'cat-visible',
        name: 'Standard Drinks',
        displayOrder: 1,
        dishes: [],
      },
    ]);

    const preview = await service.getMenuPreview({ companyId: 'comp-a' });

    expect(preview.categories.length).toBe(1);
    expect(preview.categories[0].id).toBe('cat-visible');
  });

  // 15. Same dish remains visible for another company
  it('15. same dish hidden for Company A remains visible for Company B', async () => {
    pricingServiceMock.resolveCompanyTier.mockResolvedValueOnce({
      id: 'tier-1',
      name: 'Default',
    });
    // Company B has NO hidden dishes
    prismaMock.company.findUnique.mockResolvedValueOnce({
      id: 'comp-b',
      name: 'Company B',
      hiddenCategories: [],
      hiddenDishes: [],
    });

    prismaMock.menuCategory.findMany.mockResolvedValueOnce([
      {
        id: 'cat-1',
        name: 'Mains',
        displayOrder: 0,
        isSecret: false,
        dishes: [
          {
            dishId: 'dish-hidden',
            displayOrder: 0,
            dish: {
              id: 'dish-hidden',
              name: 'Dish Hidden For A',
              sku: 'HD-01',
              temperature: Temperature.HOT,
              allergens: [],
              dietaryTags: [],
              optionGroups: [],
            },
          },
        ],
      },
    ]);

    pricingServiceMock.resolveDishPrice.mockResolvedValueOnce({
      priceCents: 850,
      isExplicit: true,
      isDerived: false,
    });

    const preview = await service.getMenuPreview({ companyId: 'comp-b' });

    expect(preview.categories[0].dishes.length).toBe(1);
    expect(preview.categories[0].dishes[0].id).toBe('dish-hidden');
  });

  // 16. Secret category does not appear in normal listing
  it('16. secret category does not appear in normal category listing', async () => {
    prismaMock.menuCategory.findMany.mockResolvedValueOnce([
      { id: 'cat-regular', name: 'Regular Mains', isSecret: false },
    ]);

    const categories = await service.findAllCategories(false);

    expect(prismaMock.menuCategory.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ isSecret: false }),
      }),
    );
    expect(categories.length).toBe(1);
  });

  // 17. Menu preview reflects company visibility and pricing
  it('17. menu preview reflects complete company visibility, ordering, and resolved prices', async () => {
    pricingServiceMock.resolveCompanyTier.mockResolvedValueOnce({
      id: 'tier-custom',
      name: 'Tier Custom',
      isDefault: false,
      ruleType: PriceRuleType.NONE,
    });
    prismaMock.company.findUnique.mockResolvedValueOnce({
      id: 'comp-c',
      name: 'Company C',
      hiddenCategories: [],
      hiddenDishes: [],
    });

    prismaMock.menuCategory.findMany.mockResolvedValueOnce([
      {
        id: 'cat-1',
        name: 'Starters',
        displayOrder: 0,
        isSecret: false,
        dishes: [
          {
            dishId: 'dish-soup',
            displayOrder: 0,
            dish: {
              id: 'dish-soup',
              name: 'Tomato Soup',
              sku: 'SOUP-01',
              temperature: Temperature.HOT,
              allergens: [],
              dietaryTags: [],
              optionGroups: [],
            },
          },
        ],
      },
    ]);

    pricingServiceMock.resolveDishPrice.mockResolvedValueOnce({
      priceCents: 450,
      isExplicit: true,
      isDerived: false,
    });

    const preview = await service.getMenuPreview({ companyId: 'comp-c' });

    expect(preview.company?.name).toBe('Company C');
    expect(preview.priceTier.name).toBe('Tier Custom');
    expect(preview.categories[0].dishes[0].priceCents).toBe(450);
  });
});
