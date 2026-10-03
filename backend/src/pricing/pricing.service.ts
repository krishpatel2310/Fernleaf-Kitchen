import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PriceRuleType, PriceTier } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePriceTierDto } from './dto/create-price-tier.dto';
import { UpdatePriceTierDto } from './dto/update-price-tier.dto';
import {
  BulkUpdateDishPricesDto,
  BulkUpdateOptionPricesDto,
} from './dto/bulk-prices.dto';

export interface PriceResolution {
  priceCents: number;
  isExplicit: boolean;
  isDerived: boolean;
}

@Injectable()
export class PricingService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Helper function for the assignment's rounding rule:
   * Round UP to the next 5 cents ($0.05 / 5 cents).
   * Implemented using pure integer arithmetic (no floating-point rounding issues).
   * Examples:
   *  210 -> 210
   *  211 -> 215
   *  214 -> 215
   *  215 -> 215
   *  216 -> 220
   */
  roundUpToNextFiveCents(cents: number): number {
    if (cents <= 0) return 0;
    const remainder = cents % 5;
    return remainder === 0 ? cents : cents + (5 - remainder);
  }

  /**
   * Calculate derived price using basis points and integer arithmetic.
   * Basis points: 1500 = 15%, 24000 = 2.4x.
   */
  calculateDerivedPrice(
    baseCents: number,
    ruleType: PriceRuleType,
    ruleValueBps?: number | null,
  ): number {
    if (baseCents <= 0) return 0;
    const bps = ruleValueBps ?? 0;

    switch (ruleType) {
      case PriceRuleType.COST_MULTIPLIER: {
        // e.g. baseCents * (24000 / 10000) = 2.4x
        // Integer rounding with half-up: (baseCents * bps + 5000) / 10000
        const rawCents = Math.floor((baseCents * bps + 5000) / 10000);
        return this.roundUpToNextFiveCents(rawCents);
      }

      case PriceRuleType.BASE_TIER_PERCENTAGE: {
        // e.g. baseCents + (baseCents * 1500 / 10000)
        const delta = Math.floor((baseCents * bps + 5000) / 10000);
        const rawCents = baseCents + delta;
        return this.roundUpToNextFiveCents(rawCents);
      }

      case PriceRuleType.NONE:
      default:
        return this.roundUpToNextFiveCents(baseCents);
    }
  }

  async findAllTiers() {
    return this.prisma.priceTier.findMany({
      include: {
        derivedFrom: { select: { id: true, name: true, ruleType: true } },
        _count: {
          select: {
            dishPrices: true,
            optionPrices: true,
            companies: true,
          },
        },
      },
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
    });
  }

  async findOneTier(id: string) {
    const tier = await this.prisma.priceTier.findUnique({
      where: { id },
      include: {
        derivedFrom: true,
        derivedChildren: true,
        dishPrices: {
          include: {
            dish: {
              select: {
                id: true,
                name: true,
                sku: true,
                costPriceCents: true,
                isActive: true,
              },
            },
          },
        },
        optionPrices: {
          include: {
            option: {
              select: {
                id: true,
                name: true,
                costPriceCents: true,
                isActive: true,
              },
            },
          },
        },
        companies: { select: { id: true, name: true } },
      },
    });

    if (!tier) {
      throw new NotFoundException(`Price tier with ID '${id}' not found`);
    }

    return tier;
  }

  async createTier(dto: CreatePriceTierDto) {
    // Validate name uniqueness
    const existing = await this.prisma.priceTier.findUnique({
      where: { name: dto.name },
    });
    if (existing) {
      throw new ConflictException(
        `Price tier with name '${dto.name}' already exists`,
      );
    }

    // Validate derivation hierarchy
    if (dto.derivedFromTierId) {
      const parent = await this.prisma.priceTier.findUnique({
        where: { id: dto.derivedFromTierId },
      });
      if (!parent) {
        throw new BadRequestException(
          `Derived parent tier with ID '${dto.derivedFromTierId}' does not exist`,
        );
      }
    }

    if (
      dto.ruleType === PriceRuleType.BASE_TIER_PERCENTAGE &&
      !dto.derivedFromTierId
    ) {
      throw new BadRequestException(
        `BASE_TIER_PERCENTAGE rule requires a valid derivedFromTierId`,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      if (dto.isDefault) {
        // Atomically unset any existing default tier
        await tx.priceTier.updateMany({
          where: { isDefault: true },
          data: { isDefault: false },
        });
      }

      return tx.priceTier.create({
        data: {
          name: dto.name,
          description: dto.description,
          isDefault: dto.isDefault ?? false,
          derivedFromTierId: dto.derivedFromTierId,
          ruleType: dto.ruleType ?? PriceRuleType.NONE,
          ruleValueBps: dto.ruleValueBps,
        },
        include: {
          derivedFrom: true,
        },
      });
    });
  }

  async updateTier(id: string, dto: UpdatePriceTierDto) {
    const tier = await this.prisma.priceTier.findUnique({ where: { id } });
    if (!tier) {
      throw new NotFoundException(`Price tier with ID '${id}' not found`);
    }

    if (dto.name && dto.name !== tier.name) {
      const existing = await this.prisma.priceTier.findUnique({
        where: { name: dto.name },
      });
      if (existing) {
        throw new ConflictException(
          `Price tier with name '${dto.name}' already exists`,
        );
      }
    }

    if (dto.derivedFromTierId !== undefined) {
      if (dto.derivedFromTierId === id) {
        throw new BadRequestException(`A price tier cannot derive from itself`);
      }
      if (dto.derivedFromTierId !== null) {
        const parent = await this.prisma.priceTier.findUnique({
          where: { id: dto.derivedFromTierId },
        });
        if (!parent) {
          throw new BadRequestException(
            `Derived parent tier with ID '${dto.derivedFromTierId}' not found`,
          );
        }
      }
    }

    const effectiveRuleType = dto.ruleType ?? tier.ruleType;
    const effectiveDerivedFrom =
      dto.derivedFromTierId !== undefined
        ? dto.derivedFromTierId
        : tier.derivedFromTierId;

    if (
      effectiveRuleType === PriceRuleType.BASE_TIER_PERCENTAGE &&
      !effectiveDerivedFrom
    ) {
      throw new BadRequestException(
        `BASE_TIER_PERCENTAGE rule requires a valid derivedFromTierId`,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      if (dto.isDefault) {
        await tx.priceTier.updateMany({
          where: { isDefault: true, id: { not: id } },
          data: { isDefault: false },
        });
      }

      return tx.priceTier.update({
        where: { id },
        data: {
          name: dto.name,
          description: dto.description,
          isDefault: dto.isDefault,
          derivedFromTierId: dto.derivedFromTierId,
          ruleType: dto.ruleType,
          ruleValueBps: dto.ruleValueBps,
        },
        include: {
          derivedFrom: true,
        },
      });
    });
  }

  async setDefaultTier(id: string) {
    const tier = await this.prisma.priceTier.findUnique({ where: { id } });
    if (!tier) {
      throw new NotFoundException(`Price tier with ID '${id}' not found`);
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.priceTier.updateMany({
        where: { isDefault: true },
        data: { isDefault: false },
      });

      return tx.priceTier.update({
        where: { id },
        data: { isDefault: true },
      });
    });
  }

  async resolveCompanyTier(companyId?: string): Promise<PriceTier> {
    if (companyId) {
      const company = await this.prisma.company.findUnique({
        where: { id: companyId },
        include: { priceTier: true },
      });

      if (company?.priceTier) {
        return company.priceTier;
      }
    }

    // Fall back to default tier
    const defaultTier = await this.prisma.priceTier.findFirst({
      where: { isDefault: true },
    });

    if (defaultTier) {
      return defaultTier;
    }

    // If no default tier configured, find first available tier
    const firstTier = await this.prisma.priceTier.findFirst({
      orderBy: { createdAt: 'asc' },
    });

    if (!firstTier) {
      throw new NotFoundException(`No price tiers configured in system`);
    }

    return firstTier;
  }

  /**
   * Resolves dish price for a given price tier.
   * Priority:
   * 1. Explicit override on current tier
   * 2. Derived from cost (COST_MULTIPLIER)
   * 3. Derived from parent tier (BASE_TIER_PERCENTAGE)
   * 4. Missing price => returns null (item unavailable for this tier)
   */
  async resolveDishPrice(
    dishId: string,
    tierId: string,
    visitedTierIds: Set<string> = new Set(),
  ): Promise<PriceResolution | null> {
    if (visitedTierIds.has(tierId)) {
      // Cycle detected
      return null;
    }

    // 1. Check explicit DishPrice
    const explicitPrice = await this.prisma.dishPrice.findUnique({
      where: { dishId_priceTierId: { dishId, priceTierId: tierId } },
    });

    if (explicitPrice) {
      return {
        priceCents: explicitPrice.priceCents,
        isExplicit: true,
        isDerived: false,
      };
    }

    // 2. Check tier derivation
    const tier = await this.prisma.priceTier.findUnique({
      where: { id: tierId },
    });

    if (!tier) return null;

    if (tier.ruleType === PriceRuleType.COST_MULTIPLIER) {
      const dish = await this.prisma.dish.findUnique({
        where: { id: dishId },
        select: { costPriceCents: true },
      });

      if (!dish) return null;
      const derived = this.calculateDerivedPrice(
        dish.costPriceCents,
        PriceRuleType.COST_MULTIPLIER,
        tier.ruleValueBps,
      );
      return {
        priceCents: derived,
        isExplicit: false,
        isDerived: true,
      };
    }

    if (
      tier.ruleType === PriceRuleType.BASE_TIER_PERCENTAGE &&
      tier.derivedFromTierId
    ) {
      visitedTierIds.add(tierId);
      const baseResult = await this.resolveDishPrice(
        dishId,
        tier.derivedFromTierId,
        visitedTierIds,
      );

      if (!baseResult) return null;

      const derived = this.calculateDerivedPrice(
        baseResult.priceCents,
        PriceRuleType.BASE_TIER_PERCENTAGE,
        tier.ruleValueBps,
      );

      return {
        priceCents: derived,
        isExplicit: false,
        isDerived: true,
      };
    }

    // No explicit price and no derivation rule => unavailable
    return null;
  }

  /**
   * Resolves option price for a given price tier.
   * Priority:
   * 1. Explicit override on current tier
   * 2. Derived from cost (COST_MULTIPLIER)
   * 3. Derived from parent tier (BASE_TIER_PERCENTAGE)
   * 4. Missing price => returns null (item unavailable for this tier)
   */
  async resolveOptionPrice(
    optionId: string,
    tierId: string,
    visitedTierIds: Set<string> = new Set(),
  ): Promise<PriceResolution | null> {
    if (visitedTierIds.has(tierId)) {
      return null;
    }

    // 1. Check explicit OptionPrice
    const explicitPrice = await this.prisma.optionPrice.findUnique({
      where: { optionId_priceTierId: { optionId, priceTierId: tierId } },
    });

    if (explicitPrice) {
      return {
        priceCents: explicitPrice.priceCents,
        isExplicit: true,
        isDerived: false,
      };
    }

    // 2. Check tier derivation
    const tier = await this.prisma.priceTier.findUnique({
      where: { id: tierId },
    });

    if (!tier) return null;

    if (tier.ruleType === PriceRuleType.COST_MULTIPLIER) {
      const option = await this.prisma.option.findUnique({
        where: { id: optionId },
        select: { costPriceCents: true },
      });

      if (!option) return null;
      const derived = this.calculateDerivedPrice(
        option.costPriceCents,
        PriceRuleType.COST_MULTIPLIER,
        tier.ruleValueBps,
      );
      return {
        priceCents: derived,
        isExplicit: false,
        isDerived: true,
      };
    }

    if (
      tier.ruleType === PriceRuleType.BASE_TIER_PERCENTAGE &&
      tier.derivedFromTierId
    ) {
      visitedTierIds.add(tierId);
      const baseResult = await this.resolveOptionPrice(
        optionId,
        tier.derivedFromTierId,
        visitedTierIds,
      );

      if (!baseResult) return null;

      const derived = this.calculateDerivedPrice(
        baseResult.priceCents,
        PriceRuleType.BASE_TIER_PERCENTAGE,
        tier.ruleValueBps,
      );

      return {
        priceCents: derived,
        isExplicit: false,
        isDerived: true,
      };
    }

    return null;
  }

  async bulkUpdateDishPrices(tierId: string, dto: BulkUpdateDishPricesDto) {
    const tier = await this.prisma.priceTier.findUnique({
      where: { id: tierId },
    });
    if (!tier) {
      throw new NotFoundException(`Price tier with ID '${tierId}' not found`);
    }

    return this.prisma.$transaction(async (tx) => {
      const results = [];
      for (const item of dto.prices) {
        const dish = await tx.dish.findUnique({ where: { id: item.dishId } });
        if (!dish) {
          throw new NotFoundException(
            `Dish with ID '${item.dishId}' not found`,
          );
        }

        const updated = await tx.dishPrice.upsert({
          where: {
            dishId_priceTierId: { dishId: item.dishId, priceTierId: tierId },
          },
          create: {
            dishId: item.dishId,
            priceTierId: tierId,
            priceCents: item.priceCents,
          },
          update: {
            priceCents: item.priceCents,
          },
        });
        results.push(updated);
      }
      return results;
    });
  }

  async bulkUpdateOptionPrices(tierId: string, dto: BulkUpdateOptionPricesDto) {
    const tier = await this.prisma.priceTier.findUnique({
      where: { id: tierId },
    });
    if (!tier) {
      throw new NotFoundException(`Price tier with ID '${tierId}' not found`);
    }

    return this.prisma.$transaction(async (tx) => {
      const results = [];
      for (const item of dto.prices) {
        const option = await tx.option.findUnique({
          where: { id: item.optionId },
        });
        if (!option) {
          throw new NotFoundException(
            `Option with ID '${item.optionId}' not found`,
          );
        }

        const updated = await tx.optionPrice.upsert({
          where: {
            optionId_priceTierId: {
              optionId: item.optionId,
              priceTierId: tierId,
            },
          },
          create: {
            optionId: item.optionId,
            priceTierId: tierId,
            priceCents: item.priceCents,
          },
          update: {
            priceCents: item.priceCents,
          },
        });
        results.push(updated);
      }
      return results;
    });
  }

  async getMissingPricesForTier(tierId: string) {
    const tier = await this.prisma.priceTier.findUnique({
      where: { id: tierId },
    });
    if (!tier) {
      throw new NotFoundException(`Price tier with ID '${tierId}' not found`);
    }

    const [dishes, options] = await Promise.all([
      this.prisma.dish.findMany({
        where: { isActive: true },
        select: { id: true, name: true, sku: true, costPriceCents: true },
      }),
      this.prisma.option.findMany({
        where: { isActive: true },
        select: { id: true, name: true, costPriceCents: true },
      }),
    ]);

    const unpricedDishes = [];
    for (const d of dishes) {
      const res = await this.resolveDishPrice(d.id, tierId);
      if (!res) {
        unpricedDishes.push(d);
      }
    }

    const unpricedOptions = [];
    for (const o of options) {
      const res = await this.resolveOptionPrice(o.id, tierId);
      if (!res) {
        unpricedOptions.push(o);
      }
    }

    return {
      tierId,
      tierName: tier.name,
      unpricedDishesCount: unpricedDishes.length,
      unpricedOptionsCount: unpricedOptions.length,
      unpricedDishes,
      unpricedOptions,
    };
  }
}
