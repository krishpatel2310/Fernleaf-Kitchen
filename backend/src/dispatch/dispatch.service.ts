import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DispatchService {
  constructor(private readonly prisma: PrismaService) {}

  async findAllDrops(dateStr?: string) {
    const deliveryDate = dateStr ? new Date(dateStr) : new Date();

    return this.prisma.drop.findMany({
      where: { deliveryDate },
      include: {
        company: { select: { id: true, name: true } },
        driver: { select: { id: true, name: true, email: true } },
        orders: {
          include: {
            order: {
              select: {
                id: true,
                orderNumber: true,
                status: true,
                employee: {
                  select: { id: true, firstName: true, lastName: true },
                },
              },
            },
          },
        },
        deliveryRecord: true,
      },
      orderBy: { deliveryTimeMinutes: 'asc' },
    });
  }

  async findDriverDrops(driverId: string, dateStr?: string) {
    const deliveryDate = dateStr ? new Date(dateStr) : new Date();

    return this.prisma.drop.findMany({
      where: {
        driverId,
        deliveryDate,
      },
      include: {
        company: { select: { id: true, name: true } },
        orders: {
          include: {
            order: {
              select: {
                id: true,
                orderNumber: true,
                employee: {
                  select: { id: true, firstName: true, lastName: true },
                },
              },
            },
          },
        },
        deliveryRecord: true,
      },
      orderBy: { deliveryTimeMinutes: 'asc' },
    });
  }

  async findOneDrop(id: string) {
    const drop = await this.prisma.drop.findUnique({
      where: { id },
      include: {
        company: true,
        driver: { select: { id: true, name: true, email: true } },
        orders: {
          include: {
            order: {
              include: {
                delivery: true,
                employee: true,
              },
            },
          },
        },
        deliveryRecord: true,
      },
    });

    if (!drop) {
      throw new NotFoundException(`Drop with ID '${id}' not found`);
    }

    return drop;
  }
}
