import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CompaniesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    return this.prisma.company.findMany({
      include: {
        domains: true,
        priceTier: true,
        addresses: {
          where: { isActive: true },
        },
      },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string) {
    const company = await this.prisma.company.findUnique({
      where: { id },
      include: {
        domains: true,
        addresses: true,
        workingDays: true,
        holidays: true,
        priceTier: true,
        ownerEmployee: true,
        defaultPackaging: true,
        defaultDriver: {
          select: { id: true, name: true, email: true },
        },
        hiddenCategories: true,
        hiddenDishes: true,
      },
    });

    if (!company) {
      throw new NotFoundException(`Company with ID '${id}' not found`);
    }

    return company;
  }
}
