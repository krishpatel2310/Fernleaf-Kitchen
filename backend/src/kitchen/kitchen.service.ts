import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class KitchenService {
  constructor(private readonly prisma: PrismaService) {}

  async getBoard(dateStr: string, stationId?: string) {
    const deliveryDate = new Date(dateStr);

    const where: any = {
      order: {
        deliveryDate,
        status: 'CONFIRMED',
      },
    };

    if (stationId) {
      where.stationId = stationId === 'unassigned' ? null : stationId;
    }

    return this.prisma.kitchenUnit.findMany({
      where,
      include: {
        station: true,
        orderCombination: {
          include: {
            orderLine: {
              include: { dish: true },
            },
            options: {
              include: {
                option: true,
                optionGroup: true,
                portionSize: true,
              },
            },
          },
        },
        order: {
          select: {
            id: true,
            orderNumber: true,
            deliveryTimeMinutes: true,
            plannedKitchenReadyAt: true,
            plannedDispatchReadyAt: true,
            company: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { order: { deliveryTimeMinutes: 'asc' } },
    });
  }

  async findOneUnit(id: string) {
    const unit = await this.prisma.kitchenUnit.findUnique({
      where: { id },
      include: {
        station: true,
        orderCombination: {
          include: {
            orderLine: true,
            options: true,
          },
        },
        order: true,
      },
    });

    if (!unit) {
      throw new NotFoundException(`Kitchen unit with ID '${id}' not found`);
    }

    return unit;
  }
}
