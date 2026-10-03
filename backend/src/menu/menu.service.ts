import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PricingService } from '../pricing/pricing.service';
import {
  CreateMenuCategoryDto,
  UpdateMenuCategoryDto,
} from './dto/menu-category.dto';
import {
  AddCategoryDishDto,
  MenuPreviewQueryDto,
  ReorderCategoriesDto,
  ReorderCategoryDishesDto,
} from './dto/menu-items.dto';

@Injectable()
export class MenuService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pricingService: PricingService,
  ) {}

  // ===========================================================================
  // CATEGORIES
  // ===========================================================================

  async findAllCategories(includeSecret = false, includeInactive = false) {
    const where: any = {};
    if (!includeInactive) {
      where.isActive = true;
    }
    if (!includeSecret) {
      where.isSecret = false;
    }

    return this.prisma.menuCategory.findMany({
      where,
      include: {
        dishes: {
          where: includeInactive
            ? undefined
            : { isActive: true, dish: { isActive: true } },
          include: {
            dish: {
              include: {
                allergens: { include: { allergen: true } },
                dietaryTags: { include: { dietaryTag: true } },
                kitchenStation: true,
              },
            },
          },
          orderBy: { displayOrder: 'asc' },
        },
      },
      orderBy: { displayOrder: 'asc' },
    });
  }

  async findCategoryById(id: string) {
    const category = await this.prisma.menuCategory.findUnique({
      where: { id },
      include: {
        dishes: {
          include: {
            dish: {
              include: {
                allergens: { include: { allergen: true } },
                dietaryTags: { include: { dietaryTag: true } },
                kitchenStation: true,
              },
            },
          },
          orderBy: { displayOrder: 'asc' },
        },
      },
    });

    if (!category) {
      throw new NotFoundException(`Menu category with ID '${id}' not found`);
    }

    return category;
  }

  async createCategory(dto: CreateMenuCategoryDto) {
    return this.prisma.menuCategory.create({
      data: {
        name: dto.name.trim(),
        description: dto.description?.trim(),
        displayOrder: dto.displayOrder ?? 0,
        isActive: dto.isActive ?? true,
        isSecret: dto.isSecret ?? false,
      },
    });
  }

  async updateCategory(id: string, dto: UpdateMenuCategoryDto) {
    const category = await this.prisma.menuCategory.findUnique({
      where: { id },
    });
    if (!category) {
      throw new NotFoundException(`Menu category with ID '${id}' not found`);
    }

    return this.prisma.menuCategory.update({
      where: { id },
      data: {
        name: dto.name ? dto.name.trim() : undefined,
        description:
          dto.description !== undefined ? dto.description?.trim() : undefined,
        displayOrder: dto.displayOrder,
        isActive: dto.isActive,
        isSecret: dto.isSecret,
      },
    });
  }

  async reorderCategories(dto: ReorderCategoriesDto) {
    return this.prisma.$transaction(async (tx) => {
      const updates = [];
      for (const item of dto.items) {
        const updated = await tx.menuCategory.update({
          where: { id: item.id },
          data: { displayOrder: item.displayOrder },
        });
        updates.push(updated);
      }
      return updates;
    });
  }

  // ===========================================================================
  // CATEGORY DISHES
  // ===========================================================================

  async addDishToCategory(categoryId: string, dto: AddCategoryDishDto) {
    const category = await this.prisma.menuCategory.findUnique({
      where: { id: categoryId },
    });
    if (!category) {
      throw new NotFoundException(
        `Menu category with ID '${categoryId}' not found`,
      );
    }

    const dish = await this.prisma.dish.findUnique({
      where: { id: dto.dishId },
    });
    if (!dish) {
      throw new NotFoundException(`Dish with ID '${dto.dishId}' not found`);
    }

    // Default display order to next highest in category if not provided
    let displayOrder = dto.displayOrder;
    if (displayOrder === undefined) {
      const highest = await this.prisma.menuCategoryDish.findFirst({
        where: { categoryId },
        orderBy: { displayOrder: 'desc' },
      });
      displayOrder = highest ? highest.displayOrder + 1 : 0;
    }

    return this.prisma.menuCategoryDish.upsert({
      where: {
        categoryId_dishId: { categoryId, dishId: dto.dishId },
      },
      create: {
        categoryId,
        dishId: dto.dishId,
        displayOrder,
        isActive: true,
      },
      update: {
        displayOrder,
        isActive: true,
      },
      include: {
        dish: true,
      },
    });
  }

  async removeDishFromCategory(categoryId: string, dishId: string) {
    const item = await this.prisma.menuCategoryDish.findUnique({
      where: {
        categoryId_dishId: { categoryId, dishId },
      },
    });

    if (!item) {
      throw new NotFoundException(
        `Dish '${dishId}' is not in category '${categoryId}'`,
      );
    }

    return this.prisma.menuCategoryDish.delete({
      where: {
        categoryId_dishId: { categoryId, dishId },
      },
    });
  }

  async reorderDishesInCategory(
    categoryId: string,
    dto: ReorderCategoryDishesDto,
  ) {
    const category = await this.prisma.menuCategory.findUnique({
      where: { id: categoryId },
    });
    if (!category) {
      throw new NotFoundException(
        `Menu category with ID '${categoryId}' not found`,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const results = [];
      for (const item of dto.items) {
        const updated = await tx.menuCategoryDish.update({
          where: {
            categoryId_dishId: { categoryId, dishId: item.dishId },
          },
          data: { displayOrder: item.displayOrder },
        });
        results.push(updated);
      }
      return results;
    });
  }

  async toggleMenuItemActive(
    categoryId: string,
    dishId: string,
    isActive: boolean,
  ) {
    const item = await this.prisma.menuCategoryDish.findUnique({
      where: {
        categoryId_dishId: { categoryId, dishId },
      },
    });

    if (!item) {
      throw new NotFoundException(
        `Dish '${dishId}' is not in category '${categoryId}'`,
      );
    }

    return this.prisma.menuCategoryDish.update({
      where: {
        categoryId_dishId: { categoryId, dishId },
      },
      data: { isActive },
    });
  }

  // ===========================================================================
  // COMPANY VISIBILITY
  // ===========================================================================

  async getCompanyVisibility(companyId: string) {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      include: {
        hiddenCategories: { include: { category: true } },
        hiddenDishes: { include: { dish: true } },
      },
    });

    if (!company) {
      throw new NotFoundException(`Company with ID '${companyId}' not found`);
    }

    return {
      companyId: company.id,
      companyName: company.name,
      hiddenCategories: company.hiddenCategories.map((hc) => ({
        categoryId: hc.categoryId,
        categoryName: hc.category.name,
      })),
      hiddenDishes: company.hiddenDishes.map((hd) => ({
        dishId: hd.dishId,
        dishName: hd.dish.name,
        sku: hd.dish.sku,
      })),
    };
  }

  async setCompanyHiddenCategory(
    companyId: string,
    categoryId: string,
    hide: boolean,
  ) {
    const [company, category] = await Promise.all([
      this.prisma.company.findUnique({ where: { id: companyId } }),
      this.prisma.menuCategory.findUnique({ where: { id: categoryId } }),
    ]);

    if (!company) {
      throw new NotFoundException(`Company with ID '${companyId}' not found`);
    }
    if (!category) {
      throw new NotFoundException(
        `Menu category with ID '${categoryId}' not found`,
      );
    }

    if (hide) {
      return this.prisma.companyHiddenCategory.upsert({
        where: {
          companyId_categoryId: { companyId, categoryId },
        },
        create: { companyId, categoryId },
        update: {},
      });
    } else {
      await this.prisma.companyHiddenCategory.deleteMany({
        where: { companyId, categoryId },
      });
      return { companyId, categoryId, hidden: false };
    }
  }

  async setCompanyHiddenDish(companyId: string, dishId: string, hide: boolean) {
    const [company, dish] = await Promise.all([
      this.prisma.company.findUnique({ where: { id: companyId } }),
      this.prisma.dish.findUnique({ where: { id: dishId } }),
    ]);

    if (!company) {
      throw new NotFoundException(`Company with ID '${companyId}' not found`);
    }
    if (!dish) {
      throw new NotFoundException(`Dish with ID '${dishId}' not found`);
    }

    if (hide) {
      return this.prisma.companyHiddenDish.upsert({
        where: {
          companyId_dishId: { companyId, dishId },
        },
        create: { companyId, dishId },
        update: {},
      });
    } else {
      await this.prisma.companyHiddenDish.deleteMany({
        where: { companyId, dishId },
      });
      return { companyId, dishId, hidden: false };
    }
  }

  // ===========================================================================
  // MENU PREVIEW
  // ===========================================================================

  async getMenuPreview(query: MenuPreviewQueryDto = {}) {
    // 1. Resolve applicable price tier for this company (or default tier)
    const tier = await this.pricingService.resolveCompanyTier(query.companyId);

    // 2. Resolve hidden categories and hidden dishes for company if companyId provided
    const hiddenCategoryIds = new Set<string>();
    const hiddenDishIds = new Set<string>();

    let companyName: string | null = null;
    if (query.companyId) {
      const company = await this.prisma.company.findUnique({
        where: { id: query.companyId },
        include: {
          hiddenCategories: true,
          hiddenDishes: true,
        },
      });

      if (!company) {
        throw new NotFoundException(
          `Company with ID '${query.companyId}' not found`,
        );
      }

      companyName = company.name;
      company.hiddenCategories.forEach((hc) =>
        hiddenCategoryIds.add(hc.categoryId),
      );
      company.hiddenDishes.forEach((hd) => hiddenDishIds.add(hd.dishId));
    }

    // 3. Fetch active categories (respecting secret category flag)
    const categoryWhere: any = { isActive: true };
    if (!query.includeSecret) {
      categoryWhere.isSecret = false;
    }

    const categories = await this.prisma.menuCategory.findMany({
      where: categoryWhere,
      include: {
        dishes: {
          where: {
            isActive: true, // active in menu
            dish: { isActive: true }, // active globally
          },
          include: {
            dish: {
              include: {
                allergens: { include: { allergen: true } },
                dietaryTags: { include: { dietaryTag: true } },
                kitchenStation: true,
                optionGroups: {
                  include: {
                    optionGroup: {
                      include: {
                        options: {
                          where: { option: { isActive: true } },
                          include: { option: true },
                          orderBy: { displayOrder: 'asc' },
                        },
                        portions: {
                          include: { portionSize: true },
                          orderBy: { displayOrder: 'asc' },
                        },
                      },
                    },
                  },
                  orderBy: { displayOrder: 'asc' },
                },
              },
            },
          },
          orderBy: { displayOrder: 'asc' },
        },
      },
      orderBy: { displayOrder: 'asc' },
    });

    // 4. Transform and filter categories and dishes according to company rules & prices
    const previewCategories = [];

    for (const cat of categories) {
      // Filter out hidden category for this company
      if (hiddenCategoryIds.has(cat.id)) {
        continue;
      }

      const previewDishes = [];
      for (const item of cat.dishes) {
        // Filter out hidden dish for this company
        if (hiddenDishIds.has(item.dishId)) {
          continue;
        }

        // Resolve dish price for this tier
        const dishPriceRes = await this.pricingService.resolveDishPrice(
          item.dish.id,
          tier.id,
        );

        // If dish has no applicable price in the tier, it is unavailable
        if (!dishPriceRes) {
          // Missing price behavior: Dish is unavailable in this tier
          continue;
        }

        // Resolve option prices for option groups
        const resolvedOptionGroups = [];
        for (const ogLink of item.dish.optionGroups) {
          const group = ogLink.optionGroup;
          if (!group.isActive) continue;

          const resolvedOptions = [];
          for (const optLink of group.options) {
            const opt = optLink.option;
            const optPriceRes = await this.pricingService.resolveOptionPrice(
              opt.id,
              tier.id,
            );

            resolvedOptions.push({
              id: opt.id,
              name: opt.name,
              displayOrder: optLink.displayOrder,
              priceCents: optPriceRes ? optPriceRes.priceCents : null,
              isAvailable: optPriceRes !== null,
            });
          }

          resolvedOptionGroups.push({
            id: group.id,
            name: group.name,
            description: group.description,
            isRequired: group.isRequired,
            displayOrder: ogLink.displayOrder,
            usesPortions: group.usesPortions,
            options: resolvedOptions,
            portions: group.usesPortions
              ? group.portions.map((p) => ({
                  portionSizeId: p.portionSizeId,
                  portionName: p.portionSize.name,
                  displayOrder: p.displayOrder,
                  extraPriceCents: p.extraPriceCents,
                }))
              : [],
          });
        }

        previewDishes.push({
          id: item.dish.id,
          sku: item.dish.sku,
          name: item.dish.name,
          description: item.dish.description,
          imageUrl: item.dish.imageUrl,
          temperature: item.dish.temperature,
          minimumOrderQuantity: item.dish.minimumOrderQuantity,
          kitchenStation: item.dish.kitchenStation?.name ?? null,
          displayOrder: item.displayOrder,
          priceCents: dishPriceRes.priceCents,
          isExplicitPrice: dishPriceRes.isExplicit,
          isDerivedPrice: dishPriceRes.isDerived,
          allergens: item.dish.allergens.map((a) => a.allergen.name),
          dietaryTags: item.dish.dietaryTags.map((d) => d.dietaryTag.name),
          optionGroups: resolvedOptionGroups,
        });
      }

      previewCategories.push({
        id: cat.id,
        name: cat.name,
        description: cat.description,
        displayOrder: cat.displayOrder,
        isSecret: cat.isSecret,
        dishes: previewDishes,
      });
    }

    return {
      company: query.companyId
        ? { id: query.companyId, name: companyName }
        : null,
      priceTier: {
        id: tier.id,
        name: tier.name,
        isDefault: tier.isDefault,
        ruleType: tier.ruleType,
      },
      categories: previewCategories,
    };
  }
}
