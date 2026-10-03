import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CatalogueService {
  constructor(private readonly prisma: PrismaService) {}

  async findAllDishes(includeInactive = false) {
    return this.prisma.dish.findMany({
      where: includeInactive ? undefined : { isActive: true },
      include: {
        kitchenStation: true,
        allergens: { include: { allergen: true } },
        dietaryTags: { include: { dietaryTag: true } },
        optionGroups: {
          include: {
            optionGroup: {
              include: {
                options: { include: { option: true } },
                portions: { include: { portionSize: true } },
              },
            },
          },
          orderBy: { displayOrder: 'asc' },
        },
      },
      orderBy: { name: 'asc' },
    });
  }

  async findOneDish(id: string) {
    const dish = await this.prisma.dish.findUnique({
      where: { id },
      include: {
        kitchenStation: true,
        allergens: { include: { allergen: true } },
        dietaryTags: { include: { dietaryTag: true } },
        optionGroups: {
          include: {
            optionGroup: {
              include: {
                options: { include: { option: true } },
                portions: { include: { portionSize: true } },
              },
            },
          },
          orderBy: { displayOrder: 'asc' },
        },
        prices: { include: { priceTier: true } },
      },
    });

    if (!dish) {
      throw new NotFoundException(`Dish with ID '${id}' not found`);
    }

    return dish;
  }

  async findAllOptions() {
    return this.prisma.option.findMany({
      where: { isActive: true },
      include: {
        allergens: { include: { allergen: true } },
        dietaryTags: { include: { dietaryTag: true } },
      },
      orderBy: { name: 'asc' },
    });
  }

  async findAllOptionGroups() {
    return this.prisma.optionGroup.findMany({
      where: { isActive: true },
      include: {
        options: {
          include: { option: true },
          orderBy: { displayOrder: 'asc' },
        },
        portions: {
          include: { portionSize: true },
          orderBy: { displayOrder: 'asc' },
        },
      },
      orderBy: { displayOrder: 'asc' },
    });
  }

  async getReferenceData() {
    const [allergens, dietaryTags, stations, packagingTypes, portionSizes] =
      await Promise.all([
        this.prisma.allergen.findMany({ where: { isActive: true } }),
        this.prisma.dietaryTag.findMany({ where: { isActive: true } }),
        this.prisma.kitchenStation.findMany({ where: { isActive: true } }),
        this.prisma.packagingType.findMany({ where: { isActive: true } }),
        this.prisma.portionSize.findMany({
          where: { isActive: true },
          orderBy: { displayOrder: 'asc' },
        }),
      ]);

    return {
      allergens,
      dietaryTags,
      stations,
      packagingTypes,
      portionSizes,
    };
  }
}
