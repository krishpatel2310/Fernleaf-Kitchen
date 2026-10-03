import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { OrderStatus } from '@prisma/client';

@Injectable()
export class OrdersService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query?: {
    status?: OrderStatus;
    companyId?: string;
    deliveryDate?: string;
    page?: number;
    limit?: number;
  }) {
    const page = query?.page ? Number(query.page) : 1;
    const limit = query?.limit ? Number(query.limit) : 20;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (query?.status) where.status = query.status;
    if (query?.companyId) where.companyId = query.companyId;
    if (query?.deliveryDate) where.deliveryDate = new Date(query.deliveryDate);

    const [items, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        skip,
        take: limit,
        include: {
          company: { select: { id: true, name: true } },
          employee: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
          packagingType: { select: { id: true, name: true } },
          delivery: true,
          invoiceEntry: true,
        },
        orderBy: { deliveryDate: 'desc' },
      }),
      this.prisma.order.count({ where }),
    ]);

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findOne(id: string) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: {
        company: true,
        employee: true,
        packagingType: true,
        delivery: true,
        lines: {
          include: {
            dish: true,
            combinations: {
              include: {
                options: {
                  include: {
                    option: true,
                    optionGroup: true,
                    portionSize: true,
                  },
                },
                kitchenUnit: true,
              },
            },
          },
        },
        kitchenUnits: {
          include: { station: true },
        },
        events: {
          include: { user: { select: { id: true, name: true, email: true } } },
          orderBy: { occurredAt: 'asc' },
        },
        invoiceEntry: {
          include: { invoice: true },
        },
        dropOrder: {
          include: { drop: true },
        },
      },
    });

    if (!order) {
      throw new NotFoundException(`Order with ID '${id}' not found`);
    }

    return order;
  }
}
