import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class EmployeesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(companyId?: string) {
    return this.prisma.employee.findMany({
      where: companyId ? { companyId, isActive: true } : { isActive: true },
      include: {
        company: {
          select: { id: true, name: true },
        },
        allergies: {
          include: { allergen: true },
        },
        dietaryTags: {
          include: { dietaryTag: true },
        },
      },
      orderBy: { lastName: 'asc' },
    });
  }

  async findOne(id: string) {
    const employee = await this.prisma.employee.findUnique({
      where: { id },
      include: {
        company: true,
        defaultDeliveryAddress: true,
        defaultPackaging: true,
        allergies: {
          include: { allergen: true },
        },
        dietaryTags: {
          include: { dietaryTag: true },
        },
      },
    });

    if (!employee) {
      throw new NotFoundException(`Employee with ID '${id}' not found`);
    }

    return employee;
  }
}
