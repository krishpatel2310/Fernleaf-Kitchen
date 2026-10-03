import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class MenuService {
  constructor(private readonly prisma: PrismaService) {}

  async findAllCategories() {
    return this.prisma.menuCategory.findMany({
      where: { isActive: true },
      include: {
        dishes: {
          where: { isActive: true, dish: { isActive: true } },
          include: {
            dish: {
              include: {
                allergens: { include: { allergen: true } },
                dietaryTags: { include: { dietaryTag: true } },
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
          include: { dish: true },
          orderBy: { displayOrder: 'asc' },
        },
      },
    });

    if (!category) {
      throw new NotFoundException(`Menu category with ID '${id}' not found`);
    }

    return category;
  }
}
