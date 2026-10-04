import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateDishDto } from './dto/create-dish.dto';
import { UpdateDishDto } from './dto/update-dish.dto';
import {
  QueryDishDto,
  QueryOptionDto,
  QueryOptionGroupDto,
} from './dto/query-catalogue.dto';
import { CreateOptionDto, UpdateOptionDto } from './dto/create-option.dto';
import {
  CreateOptionGroupDto,
  UpdateOptionGroupDto,
} from './dto/create-option-group.dto';
import {
  CreateReferenceDataDto,
  UpdateReferenceDataDto,
} from './dto/reference-data.dto';

export type ReferenceDataType =
  | 'allergens'
  | 'dietary-tags'
  | 'kitchen-stations'
  | 'packaging-types'
  | 'portion-sizes';

@Injectable()
export class CatalogueService {
  constructor(private readonly prisma: PrismaService) {}

  // ===========================================================================
  // 1. REFERENCE DATA
  // ===========================================================================

  async getReferenceData() {
    const [allergens, dietaryTags, stations, packagingTypes, portionSizes] =
      await Promise.all([
        this.prisma.allergen.findMany({
          where: { isActive: true },
          orderBy: { name: 'asc' },
        }),
        this.prisma.dietaryTag.findMany({
          where: { isActive: true },
          orderBy: { name: 'asc' },
        }),
        this.prisma.kitchenStation.findMany({
          where: { isActive: true },
          orderBy: { name: 'asc' },
        }),
        this.prisma.packagingType.findMany({
          where: { isActive: true },
          orderBy: { name: 'asc' },
        }),
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

  async getReferenceDataList(type: ReferenceDataType, includeInactive = false) {
    const where = includeInactive ? undefined : { isActive: true };

    switch (type) {
      case 'allergens':
        return this.prisma.allergen.findMany({
          where,
          orderBy: { name: 'asc' },
        });
      case 'dietary-tags':
        return this.prisma.dietaryTag.findMany({
          where,
          orderBy: { name: 'asc' },
        });
      case 'kitchen-stations':
        return this.prisma.kitchenStation.findMany({
          where,
          orderBy: { name: 'asc' },
        });
      case 'packaging-types':
        return this.prisma.packagingType.findMany({
          where,
          orderBy: { name: 'asc' },
        });
      case 'portion-sizes':
        return this.prisma.portionSize.findMany({
          where,
          orderBy: { displayOrder: 'asc' },
        });
      default:
        throw new BadRequestException(`Unknown reference data type '${type}'`);
    }
  }

  async createReferenceData(
    type: ReferenceDataType,
    dto: CreateReferenceDataDto,
  ) {
    const name = dto.name.trim();

    switch (type) {
      case 'allergens': {
        const existing = await this.prisma.allergen.findUnique({
          where: { name },
        });
        if (existing) {
          throw new ConflictException(
            `Allergen with name '${name}' already exists`,
          );
        }
        return this.prisma.allergen.create({ data: { name } });
      }
      case 'dietary-tags': {
        const existing = await this.prisma.dietaryTag.findUnique({
          where: { name },
        });
        if (existing) {
          throw new ConflictException(
            `Dietary tag with name '${name}' already exists`,
          );
        }
        return this.prisma.dietaryTag.create({ data: { name } });
      }
      case 'kitchen-stations': {
        const existing = await this.prisma.kitchenStation.findUnique({
          where: { name },
        });
        if (existing) {
          throw new ConflictException(
            `Kitchen station with name '${name}' already exists`,
          );
        }
        return this.prisma.kitchenStation.create({ data: { name } });
      }
      case 'packaging-types': {
        const existing = await this.prisma.packagingType.findUnique({
          where: { name },
        });
        if (existing) {
          throw new ConflictException(
            `Packaging type with name '${name}' already exists`,
          );
        }
        return this.prisma.packagingType.create({ data: { name } });
      }
      case 'portion-sizes': {
        const existing = await this.prisma.portionSize.findUnique({
          where: { name },
        });
        if (existing) {
          throw new ConflictException(
            `Portion size with name '${name}' already exists`,
          );
        }
        return this.prisma.portionSize.create({
          data: {
            name,
            displayOrder: dto.displayOrder ?? 0,
          },
        });
      }
      default:
        throw new BadRequestException(`Unknown reference data type '${type}'`);
    }
  }

  async updateReferenceData(
    type: ReferenceDataType,
    id: string,
    dto: UpdateReferenceDataDto,
  ) {
    const data: any = {};
    if (dto.name) data.name = dto.name.trim();
    if (dto.isActive !== undefined) data.isActive = dto.isActive;

    switch (type) {
      case 'allergens':
        return this.prisma.allergen.update({ where: { id }, data });
      case 'dietary-tags':
        return this.prisma.dietaryTag.update({ where: { id }, data });
      case 'kitchen-stations':
        return this.prisma.kitchenStation.update({ where: { id }, data });
      case 'packaging-types':
        return this.prisma.packagingType.update({ where: { id }, data });
      case 'portion-sizes': {
        if (dto.displayOrder !== undefined)
          data.displayOrder = dto.displayOrder;
        return this.prisma.portionSize.update({ where: { id }, data });
      }
      default:
        throw new BadRequestException(`Unknown reference data type '${type}'`);
    }
  }

  // ===========================================================================
  // 2. DISHES
  // ===========================================================================

  async findAllDishes(query: QueryDishDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (query.isActive !== undefined) {
      where.isActive = query.isActive;
    } else if (!query.includeInactive) {
      where.isActive = true;
    }
    if (query.temperature) {
      where.temperature = query.temperature;
    }
    if (query.kitchenStationId) {
      where.kitchenStationId = query.kitchenStationId;
    }
    if (query.search) {
      const q = query.search.trim();
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { sku: { contains: q, mode: 'insensitive' } },
        { description: { contains: q, mode: 'insensitive' } },
      ];
    }

    const [total, data] = await Promise.all([
      this.prisma.dish.count({ where }),
      this.prisma.dish.findMany({
        where,
        skip,
        take: limit,
        include: {
          kitchenStation: true,
          allergens: { include: { allergen: true } },
          dietaryTags: { include: { dietaryTag: true } },
          optionGroups: {
            include: {
              optionGroup: {
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
              },
            },
            orderBy: { displayOrder: 'asc' },
          },
        },
        orderBy: { name: 'asc' },
      }),
    ]);

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
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
                options: {
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
        prices: {
          include: { priceTier: true },
        },
      },
    });

    if (!dish) {
      throw new NotFoundException(`Dish with ID '${id}' not found`);
    }

    return dish;
  }

  async createDish(dto: CreateDishDto) {
    const sku = dto.sku.trim().toUpperCase();

    // Check SKU uniqueness
    const existingSku = await this.prisma.dish.findUnique({
      where: { sku },
    });
    if (existingSku) {
      throw new ConflictException(`Dish with SKU '${sku}' already exists`);
    }

    // Validate kitchen station
    if (dto.kitchenStationId) {
      const station = await this.prisma.kitchenStation.findUnique({
        where: { id: dto.kitchenStationId },
      });
      if (!station) {
        throw new BadRequestException(
          `Kitchen station with ID '${dto.kitchenStationId}' does not exist`,
        );
      }
    }

    // Validate allergens
    if (dto.allergenIds && dto.allergenIds.length > 0) {
      const count = await this.prisma.allergen.count({
        where: { id: { in: dto.allergenIds } },
      });
      if (count !== dto.allergenIds.length) {
        throw new BadRequestException(`One or more allergen IDs are invalid`);
      }
    }

    // Validate dietary tags
    if (dto.dietaryTagIds && dto.dietaryTagIds.length > 0) {
      const count = await this.prisma.dietaryTag.count({
        where: { id: { in: dto.dietaryTagIds } },
      });
      if (count !== dto.dietaryTagIds.length) {
        throw new BadRequestException(
          `One or more dietary tag IDs are invalid`,
        );
      }
    }

    // Validate option groups
    if (dto.optionGroups && dto.optionGroups.length > 0) {
      const groupIds = dto.optionGroups.map((g) => g.optionGroupId);
      const count = await this.prisma.optionGroup.count({
        where: { id: { in: groupIds } },
      });
      if (count !== groupIds.length) {
        throw new BadRequestException(
          `One or more option group IDs are invalid`,
        );
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const dish = await tx.dish.create({
        data: {
          sku,
          name: dto.name.trim(),
          description: dto.description?.trim(),
          imageUrl: dto.imageUrl?.trim(),
          temperature: dto.temperature,
          costPriceCents: dto.costPriceCents,
          minimumOrderQuantity: dto.minimumOrderQuantity,
          kitchenStationId: dto.kitchenStationId,
        },
      });

      if (dto.allergenIds && dto.allergenIds.length > 0) {
        await tx.dishAllergen.createMany({
          data: dto.allergenIds.map((allergenId) => ({
            dishId: dish.id,
            allergenId,
          })),
        });
      }

      if (dto.dietaryTagIds && dto.dietaryTagIds.length > 0) {
        await tx.dishDietaryTag.createMany({
          data: dto.dietaryTagIds.map((dietaryTagId) => ({
            dishId: dish.id,
            dietaryTagId,
          })),
        });
      }

      if (dto.optionGroups && dto.optionGroups.length > 0) {
        await tx.dishOptionGroup.createMany({
          data: dto.optionGroups.map((g, index) => ({
            dishId: dish.id,
            optionGroupId: g.optionGroupId,
            displayOrder: g.displayOrder ?? index,
          })),
        });
      }

      return tx.dish.findUnique({
        where: { id: dish.id },
        include: {
          kitchenStation: true,
          allergens: { include: { allergen: true } },
          dietaryTags: { include: { dietaryTag: true } },
          optionGroups: {
            include: { optionGroup: true },
            orderBy: { displayOrder: 'asc' },
          },
        },
      });
    });
  }

  async updateDish(id: string, dto: UpdateDishDto) {
    const dish = await this.prisma.dish.findUnique({ where: { id } });
    if (!dish) {
      throw new NotFoundException(`Dish with ID '${id}' not found`);
    }

    if (dto.sku && dto.sku.trim().toUpperCase() !== dish.sku) {
      const newSku = dto.sku.trim().toUpperCase();
      const existingSku = await this.prisma.dish.findUnique({
        where: { sku: newSku },
      });
      if (existingSku) {
        throw new ConflictException(`Dish with SKU '${newSku}' already exists`);
      }
    }

    if (dto.kitchenStationId) {
      const station = await this.prisma.kitchenStation.findUnique({
        where: { id: dto.kitchenStationId },
      });
      if (!station) {
        throw new BadRequestException(
          `Kitchen station with ID '${dto.kitchenStationId}' does not exist`,
        );
      }
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.dish.update({
        where: { id },
        data: {
          sku: dto.sku ? dto.sku.trim().toUpperCase() : undefined,
          name: dto.name ? dto.name.trim() : undefined,
          description:
            dto.description !== undefined ? dto.description?.trim() : undefined,
          imageUrl:
            dto.imageUrl !== undefined ? dto.imageUrl?.trim() : undefined,
          temperature: dto.temperature,
          costPriceCents: dto.costPriceCents,
          minimumOrderQuantity: dto.minimumOrderQuantity,
          kitchenStationId: dto.kitchenStationId,
          isActive: dto.isActive,
        },
      });

      if (dto.allergenIds !== undefined) {
        await tx.dishAllergen.deleteMany({ where: { dishId: id } });
        if (dto.allergenIds.length > 0) {
          await tx.dishAllergen.createMany({
            data: dto.allergenIds.map((allergenId) => ({
              dishId: id,
              allergenId,
            })),
          });
        }
      }

      if (dto.dietaryTagIds !== undefined) {
        await tx.dishDietaryTag.deleteMany({ where: { dishId: id } });
        if (dto.dietaryTagIds.length > 0) {
          await tx.dishDietaryTag.createMany({
            data: dto.dietaryTagIds.map((dietaryTagId) => ({
              dishId: id,
              dietaryTagId,
            })),
          });
        }
      }

      if (dto.optionGroups !== undefined) {
        await tx.dishOptionGroup.deleteMany({ where: { dishId: id } });
        if (dto.optionGroups.length > 0) {
          await tx.dishOptionGroup.createMany({
            data: dto.optionGroups.map((g, index) => ({
              dishId: id,
              optionGroupId: g.optionGroupId,
              displayOrder: g.displayOrder ?? index,
            })),
          });
        }
      }

      return tx.dish.findUnique({
        where: { id },
        include: {
          kitchenStation: true,
          allergens: { include: { allergen: true } },
          dietaryTags: { include: { dietaryTag: true } },
          optionGroups: {
            include: { optionGroup: true },
            orderBy: { displayOrder: 'asc' },
          },
        },
      });
    });
  }

  async setDishActive(id: string, isActive: boolean) {
    const dish = await this.prisma.dish.findUnique({ where: { id } });
    if (!dish) {
      throw new NotFoundException(`Dish with ID '${id}' not found`);
    }

    return this.prisma.dish.update({
      where: { id },
      data: { isActive },
    });
  }

  // ===========================================================================
  // 3. OPTIONS
  // ===========================================================================

  async findAllOptions(query: QueryOptionDto = {}) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (!query.includeInactive) {
      where.isActive = true;
    }
    if (query.search) {
      where.name = { contains: query.search.trim(), mode: 'insensitive' };
    }

    const [total, data] = await Promise.all([
      this.prisma.option.count({ where }),
      this.prisma.option.findMany({
        where,
        skip,
        take: limit,
        include: {
          allergens: { include: { allergen: true } },
          dietaryTags: { include: { dietaryTag: true } },
          groups: {
            include: { optionGroup: true },
          },
        },
        orderBy: { name: 'asc' },
      }),
    ]);

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  async findOneOption(id: string) {
    const option = await this.prisma.option.findUnique({
      where: { id },
      include: {
        allergens: { include: { allergen: true } },
        dietaryTags: { include: { dietaryTag: true } },
        groups: {
          include: { optionGroup: true },
        },
        prices: {
          include: { priceTier: true },
        },
      },
    });

    if (!option) {
      throw new NotFoundException(`Option with ID '${id}' not found`);
    }

    return option;
  }

  async createOption(dto: CreateOptionDto) {
    // Validate allergens
    if (dto.allergenIds && dto.allergenIds.length > 0) {
      const count = await this.prisma.allergen.count({
        where: { id: { in: dto.allergenIds } },
      });
      if (count !== dto.allergenIds.length) {
        throw new BadRequestException(`One or more allergen IDs are invalid`);
      }
    }

    // Validate dietary tags
    if (dto.dietaryTagIds && dto.dietaryTagIds.length > 0) {
      const count = await this.prisma.dietaryTag.count({
        where: { id: { in: dto.dietaryTagIds } },
      });
      if (count !== dto.dietaryTagIds.length) {
        throw new BadRequestException(
          `One or more dietary tag IDs are invalid`,
        );
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const option = await tx.option.create({
        data: {
          name: dto.name.trim(),
          costPriceCents: dto.costPriceCents,
        },
      });

      if (dto.allergenIds && dto.allergenIds.length > 0) {
        await tx.optionAllergen.createMany({
          data: dto.allergenIds.map((allergenId) => ({
            optionId: option.id,
            allergenId,
          })),
        });
      }

      if (dto.dietaryTagIds && dto.dietaryTagIds.length > 0) {
        await tx.optionDietaryTag.createMany({
          data: dto.dietaryTagIds.map((dietaryTagId) => ({
            optionId: option.id,
            dietaryTagId,
          })),
        });
      }

      return tx.option.findUnique({
        where: { id: option.id },
        include: {
          allergens: { include: { allergen: true } },
          dietaryTags: { include: { dietaryTag: true } },
        },
      });
    });
  }

  async updateOption(id: string, dto: UpdateOptionDto) {
    const option = await this.prisma.option.findUnique({ where: { id } });
    if (!option) {
      throw new NotFoundException(`Option with ID '${id}' not found`);
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.option.update({
        where: { id },
        data: {
          name: dto.name ? dto.name.trim() : undefined,
          costPriceCents: dto.costPriceCents,
          isActive: dto.isActive,
        },
      });

      if (dto.allergenIds !== undefined) {
        await tx.optionAllergen.deleteMany({ where: { optionId: id } });
        if (dto.allergenIds.length > 0) {
          await tx.optionAllergen.createMany({
            data: dto.allergenIds.map((allergenId) => ({
              optionId: id,
              allergenId,
            })),
          });
        }
      }

      if (dto.dietaryTagIds !== undefined) {
        await tx.optionDietaryTag.deleteMany({ where: { optionId: id } });
        if (dto.dietaryTagIds.length > 0) {
          await tx.optionDietaryTag.createMany({
            data: dto.dietaryTagIds.map((dietaryTagId) => ({
              optionId: id,
              dietaryTagId,
            })),
          });
        }
      }

      return tx.option.findUnique({
        where: { id },
        include: {
          allergens: { include: { allergen: true } },
          dietaryTags: { include: { dietaryTag: true } },
        },
      });
    });
  }

  async setOptionActive(id: string, isActive: boolean) {
    const option = await this.prisma.option.findUnique({ where: { id } });
    if (!option) {
      throw new NotFoundException(`Option with ID '${id}' not found`);
    }

    return this.prisma.option.update({
      where: { id },
      data: { isActive },
    });
  }

  // ===========================================================================
  // 4. OPTION GROUPS
  // ===========================================================================

  async findAllOptionGroups(query: QueryOptionGroupDto = {}) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (!query.includeInactive) {
      where.isActive = true;
    }

    const [total, data] = await Promise.all([
      this.prisma.optionGroup.count({ where }),
      this.prisma.optionGroup.findMany({
        where,
        skip,
        take: limit,
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
      }),
    ]);

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  async findOneOptionGroup(id: string) {
    const group = await this.prisma.optionGroup.findUnique({
      where: { id },
      include: {
        options: {
          include: { option: true },
          orderBy: { displayOrder: 'asc' },
        },
        portions: {
          include: { portionSize: true },
          orderBy: { displayOrder: 'asc' },
        },
        dishes: {
          include: { dish: true },
        },
      },
    });

    if (!group) {
      throw new NotFoundException(`Option group with ID '${id}' not found`);
    }

    return group;
  }

  async createOptionGroup(dto: CreateOptionGroupDto) {
    // Validate options exist
    if (dto.options && dto.options.length > 0) {
      const optionIds = dto.options.map((o) => o.optionId);
      const count = await this.prisma.option.count({
        where: { id: { in: optionIds } },
      });
      if (count !== optionIds.length) {
        throw new BadRequestException(`One or more option IDs are invalid`);
      }
    }

    // Validate portions exist
    if (dto.portions && dto.portions.length > 0) {
      if (!dto.usesPortions) {
        throw new BadRequestException(
          `Cannot attach portions to an option group that does not use portions (usesPortions = false)`,
        );
      }
      const portionIds = dto.portions.map((p) => p.portionSizeId);
      const count = await this.prisma.portionSize.count({
        where: { id: { in: portionIds } },
      });
      if (count !== portionIds.length) {
        throw new BadRequestException(
          `One or more portion size IDs are invalid`,
        );
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const group = await tx.optionGroup.create({
        data: {
          name: dto.name.trim(),
          description: dto.description?.trim(),
          isRequired: dto.isRequired ?? true,
          displayOrder: dto.displayOrder ?? 0,
          usesPortions: dto.usesPortions ?? false,
        },
      });

      if (dto.options && dto.options.length > 0) {
        await tx.optionGroupOption.createMany({
          data: dto.options.map((o, idx) => ({
            optionGroupId: group.id,
            optionId: o.optionId,
            displayOrder: o.displayOrder ?? idx,
          })),
        });
      }

      if (dto.usesPortions && dto.portions && dto.portions.length > 0) {
        await tx.optionGroupPortion.createMany({
          data: dto.portions.map((p, idx) => ({
            optionGroupId: group.id,
            portionSizeId: p.portionSizeId,
            displayOrder: p.displayOrder ?? idx,
            extraPriceCents: p.extraPriceCents ?? 0,
          })),
        });
      }

      return tx.optionGroup.findUnique({
        where: { id: group.id },
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
      });
    });
  }

  async updateOptionGroup(id: string, dto: UpdateOptionGroupDto) {
    const group = await this.prisma.optionGroup.findUnique({ where: { id } });
    if (!group) {
      throw new NotFoundException(`Option group with ID '${id}' not found`);
    }

    const effectiveUsesPortions =
      dto.usesPortions !== undefined ? dto.usesPortions : group.usesPortions;

    if (dto.portions && dto.portions.length > 0 && !effectiveUsesPortions) {
      throw new BadRequestException(
        `Cannot attach portions to an option group that does not use portions (usesPortions = false)`,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.optionGroup.update({
        where: { id },
        data: {
          name: dto.name ? dto.name.trim() : undefined,
          description:
            dto.description !== undefined ? dto.description?.trim() : undefined,
          isRequired: dto.isRequired,
          displayOrder: dto.displayOrder,
          usesPortions: dto.usesPortions,
          isActive: dto.isActive,
        },
      });

      if (dto.options !== undefined) {
        await tx.optionGroupOption.deleteMany({
          where: { optionGroupId: id },
        });
        if (dto.options.length > 0) {
          await tx.optionGroupOption.createMany({
            data: dto.options.map((o, idx) => ({
              optionGroupId: id,
              optionId: o.optionId,
              displayOrder: o.displayOrder ?? idx,
            })),
          });
        }
      }

      if (dto.portions !== undefined || !effectiveUsesPortions) {
        await tx.optionGroupPortion.deleteMany({
          where: { optionGroupId: id },
        });
        if (effectiveUsesPortions && dto.portions && dto.portions.length > 0) {
          await tx.optionGroupPortion.createMany({
            data: dto.portions.map((p, idx) => ({
              optionGroupId: id,
              portionSizeId: p.portionSizeId,
              displayOrder: p.displayOrder ?? idx,
              extraPriceCents: p.extraPriceCents ?? 0,
            })),
          });
        }
      }

      return tx.optionGroup.findUnique({
        where: { id },
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
      });
    });
  }

  async setOptionGroupActive(id: string, isActive: boolean) {
    const group = await this.prisma.optionGroup.findUnique({ where: { id } });
    if (!group) {
      throw new NotFoundException(`Option group with ID '${id}' not found`);
    }

    return this.prisma.optionGroup.update({
      where: { id },
      data: { isActive },
    });
  }
}
