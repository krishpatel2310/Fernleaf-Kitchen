import { Test, TestingModule } from '@nestjs/testing';
import { PricingService } from './pricing.service';
import { PrismaService } from '../prisma/prisma.service';
import { PriceRuleType } from '@prisma/client';

describe('PricingService - Domain Rules (Items 18 to 30)', () => {
  let service: PricingService;
  let prismaMock: any;

  beforeEach(async () => {
    prismaMock = {
      priceTier: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      dish: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
      },
      option: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
      },
      dishPrice: {
        findUnique: jest.fn(),
        upsert: jest.fn(),
      },
      optionPrice: {
        findUnique: jest.fn(),
        upsert: jest.fn(),
      },
      company: {
        findUnique: jest.fn(),
      },
      $transaction: jest.fn((callback) => callback(prismaMock)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PricingService,
        {
          provide: PrismaService,
          useValue: prismaMock,
        },
      ],
    }).compile();

    service = module.get<PricingService>(PricingService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // 18. Create price tier
  it('18. should create price tier', async () => {
    prismaMock.priceTier.findUnique.mockResolvedValueOnce(null);
    prismaMock.priceTier.create.mockResolvedValueOnce({
      id: 'tier-1',
      name: 'Corporate Tier',
      ruleType: PriceRuleType.NONE,
      isDefault: false,
    });

    const res = await service.createTier({
      name: 'Corporate Tier',
      ruleType: PriceRuleType.NONE,
    });

    expect(res.name).toBe('Corporate Tier');
    expect(prismaMock.priceTier.create).toHaveBeenCalled();
  });

  // 19. Set default tier
  it('19. should set a tier as default and unset other defaults', async () => {
    prismaMock.priceTier.findUnique.mockResolvedValueOnce({
      id: 'tier-2',
      name: 'VIP Tier',
      isDefault: false,
    });
    prismaMock.priceTier.update.mockResolvedValueOnce({
      id: 'tier-2',
      name: 'VIP Tier',
      isDefault: true,
    });

    const res = await service.setDefaultTier('tier-2');

    expect(prismaMock.priceTier.updateMany).toHaveBeenCalledWith({
      where: { isDefault: true },
      data: { isDefault: false },
    });
    expect(res.isDefault).toBe(true);
  });

  // 20. Prevent multiple defaults (enforced atomically via transaction)
  it('20. should prevent multiple defaults during createTier with isDefault=true', async () => {
    prismaMock.priceTier.findUnique.mockResolvedValueOnce(null);
    prismaMock.priceTier.create.mockResolvedValueOnce({
      id: 'tier-3',
      name: 'New Default',
      isDefault: true,
    });

    await service.createTier({
      name: 'New Default',
      isDefault: true,
    });

    expect(prismaMock.priceTier.updateMany).toHaveBeenCalledWith({
      where: { isDefault: true },
      data: { isDefault: false },
    });
  });

  // 21. Explicit dish price resolves correctly
  it('21. should resolve explicit dish price correctly', async () => {
    prismaMock.dishPrice.findUnique.mockResolvedValueOnce({
      dishId: 'dish-1',
      priceTierId: 'tier-1',
      priceCents: 1250,
    });

    const res = await service.resolveDishPrice('dish-1', 'tier-1');

    expect(res).toEqual({
      priceCents: 1250,
      isExplicit: true,
      isDerived: false,
    });
  });

  // 22. Explicit option price resolves correctly
  it('22. should resolve explicit option price correctly', async () => {
    prismaMock.optionPrice.findUnique.mockResolvedValueOnce({
      optionId: 'opt-1',
      priceTierId: 'tier-1',
      priceCents: 350,
    });

    const res = await service.resolveOptionPrice('opt-1', 'tier-1');

    expect(res).toEqual({
      priceCents: 350,
      isExplicit: true,
      isDerived: false,
    });
  });

  // 23. Cost multiplier resolves correctly
  it('23. should resolve cost multiplier derived price correctly', async () => {
    // Explicit not found
    prismaMock.dishPrice.findUnique.mockResolvedValueOnce(null);
    // Tier with COST_MULTIPLIER: 2.4x = 24000 bps
    prismaMock.priceTier.findUnique.mockResolvedValueOnce({
      id: 'tier-mult',
      ruleType: PriceRuleType.COST_MULTIPLIER,
      ruleValueBps: 24000,
    });
    // Dish cost: 400 cents ($4.00) => 400 * 2.4 = 960 cents ($9.60)
    prismaMock.dish.findUnique.mockResolvedValueOnce({
      id: 'dish-1',
      costPriceCents: 400,
    });

    const res = await service.resolveDishPrice('dish-1', 'tier-mult');

    expect(res).toEqual({
      priceCents: 960,
      isExplicit: false,
      isDerived: true,
    });
  });

  // 24. Base-tier percentage resolves correctly
  it('24. should resolve base-tier percentage derived price correctly', async () => {
    // Tier-child: BASE_TIER_PERCENTAGE: +15% = 1500 bps from tier-base
    prismaMock.dishPrice.findUnique
      .mockResolvedValueOnce(null) // no explicit on child
      .mockResolvedValueOnce({
        dishId: 'dish-1',
        priceTierId: 'tier-base',
        priceCents: 1000, // $10.00 on base tier
      });

    prismaMock.priceTier.findUnique.mockResolvedValueOnce({
      id: 'tier-child',
      ruleType: PriceRuleType.BASE_TIER_PERCENTAGE,
      ruleValueBps: 1500,
      derivedFromTierId: 'tier-base',
    });

    // 1000 + (1000 * 1500 / 10000) = 1000 + 150 = 1150
    const res = await service.resolveDishPrice('dish-1', 'tier-child');

    expect(res).toEqual({
      priceCents: 1150,
      isExplicit: false,
      isDerived: true,
    });
  });

  // 25. Derived price rounds UP to $0.05
  describe('25. Derived price rounds UP to $0.05', () => {
    it('should round 210 cents to 210 cents ($2.10)', () => {
      expect(service.roundUpToNextFiveCents(210)).toBe(210);
    });

    it('should round 211 cents to 215 cents ($2.15)', () => {
      expect(service.roundUpToNextFiveCents(211)).toBe(215);
    });

    it('should round 214 cents to 215 cents ($2.15)', () => {
      expect(service.roundUpToNextFiveCents(214)).toBe(215);
    });

    it('should round 215 cents to 215 cents ($2.15)', () => {
      expect(service.roundUpToNextFiveCents(215)).toBe(215);
    });

    it('should round 216 cents to 220 cents ($2.20)', () => {
      expect(service.roundUpToNextFiveCents(216)).toBe(220);
    });

    it('should round derived cost multiplier up to nearest 5 cents', () => {
      // Cost: 333 cents, multiplier: 1.5x (15000 bps)
      // 333 * 1.5 = 499.5 -> 500 cents -> 500
      // Let's test cost = 301 cents * 1.5 = 451.5 -> 452 -> rounded to 455
      const derived = service.calculateDerivedPrice(
        301,
        PriceRuleType.COST_MULTIPLIER,
        15000,
      );
      expect(derived).toBe(455);
    });
  });

  // 26. Missing price makes item unavailable
  it('26. should return null when tier has ruleType NONE and no explicit price', async () => {
    prismaMock.dishPrice.findUnique.mockResolvedValueOnce(null);
    prismaMock.priceTier.findUnique.mockResolvedValueOnce({
      id: 'tier-none',
      ruleType: PriceRuleType.NONE,
      derivedFromTierId: null,
    });

    const res = await service.resolveDishPrice('dish-unpriced', 'tier-none');

    expect(res).toBeNull();
  });

  // 27. Company-specific tier resolves correctly
  it('27. should resolve company-specific tier if configured', async () => {
    prismaMock.company.findUnique.mockResolvedValueOnce({
      id: 'comp-1',
      name: 'Acme Corp',
      priceTier: {
        id: 'tier-acme',
        name: 'Acme Tier',
      },
    });

    const tier = await service.resolveCompanyTier('comp-1');

    expect(tier.id).toBe('tier-acme');
  });

  // 28. Company without tier uses default tier
  it('28. should fallback to default tier if company has no custom tier', async () => {
    prismaMock.company.findUnique.mockResolvedValueOnce({
      id: 'comp-2',
      name: 'Beta Corp',
      priceTier: null,
    });
    prismaMock.priceTier.findFirst.mockResolvedValueOnce({
      id: 'tier-default',
      name: 'Default Tier',
      isDefault: true,
    });

    const tier = await service.resolveCompanyTier('comp-2');

    expect(tier.id).toBe('tier-default');
    expect(tier.isDefault).toBe(true);
  });

  // 29. Explicit override beats derived value
  it('29. should prioritize explicit dish price over derived rule value', async () => {
    // Explicit price exists
    prismaMock.dishPrice.findUnique.mockResolvedValueOnce({
      dishId: 'dish-1',
      priceTierId: 'tier-mult',
      priceCents: 1100, // Explicit override
    });
    // Even if tier has COST_MULTIPLIER that would calculate 960
    prismaMock.priceTier.findUnique.mockResolvedValueOnce({
      id: 'tier-mult',
      ruleType: PriceRuleType.COST_MULTIPLIER,
      ruleValueBps: 24000,
    });

    const res = await service.resolveDishPrice('dish-1', 'tier-mult');

    expect(res).toEqual({
      priceCents: 1100,
      isExplicit: true,
      isDerived: false,
    });
  });

  // 30. No floating-point money calculation
  it('30. should never produce fractional floating-point cents', () => {
    // Test a wide variety of edge numbers and bps values
    const testCases = [
      { base: 333, bps: 1333, rule: PriceRuleType.COST_MULTIPLIER },
      { base: 999, bps: 1750, rule: PriceRuleType.COST_MULTIPLIER },
      { base: 1234, bps: 1234, rule: PriceRuleType.BASE_TIER_PERCENTAGE },
      { base: 1, bps: 33333, rule: PriceRuleType.COST_MULTIPLIER },
      { base: 77777, bps: 100, rule: PriceRuleType.BASE_TIER_PERCENTAGE },
    ];

    for (const tc of testCases) {
      const result = service.calculateDerivedPrice(tc.base, tc.rule, tc.bps);
      expect(Number.isInteger(result)).toBe(true);
      expect(result % 5).toBe(0);
      expect(result).toBeGreaterThanOrEqual(0);
    }
  });
});
