import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PricingService {
  constructor(private readonly prisma: PrismaService) {}

  async findAllTiers() {
    return this.prisma.priceTier.findMany({
      include: {
        derivedFrom: { select: { id: true, name: true } },
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
        dishPrices: { include: { dish: true } },
        optionPrices: { include: { option: true } },
        companies: true,
      },
    });

    if (!tier) {
      throw new NotFoundException(`Price tier with ID '${id}' not found`);
    }

    return tier;
  }

  /**
   * Helper function for the assignment's rounding rule:
   * Round UP to the next 5 cents ($0.05 / 5 cents).
   * Example: 211 cents ($2.11) -> 215 cents ($2.15)
   */
  roundUpToNextFiveCents(cents: number): number {
    return Math.ceil(cents / 5) * 5;
  }
}
