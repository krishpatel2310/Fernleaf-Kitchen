import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DashboardsService {
  constructor(private readonly prisma: PrismaService) {}

  async getAdminSummary() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [totalOrders, ordersByStatus, activeCompanies, pendingInvoices] =
      await Promise.all([
        this.prisma.order.count(),
        this.prisma.order.groupBy({
          by: ['status'],
          _count: { status: true },
        }),
        this.prisma.company.count(),
        this.prisma.invoice.count({
          where: { status: 'ISSUED' },
        }),
      ]);

    return {
      totalOrders,
      ordersByStatus,
      activeCompanies,
      pendingInvoices,
      generatedAt: new Date().toISOString(),
    };
  }

  async getKitchenSummary(dateStr?: string) {
    const deliveryDate = dateStr ? new Date(dateStr) : new Date();

    const [unitsByStatus, unitsByStation] = await Promise.all([
      this.prisma.kitchenUnit.groupBy({
        by: ['status'],
        where: {
          order: { deliveryDate, status: 'CONFIRMED' },
        },
        _count: { status: true },
      }),
      this.prisma.kitchenUnit.groupBy({
        by: ['stationId'],
        where: {
          order: { deliveryDate, status: 'CONFIRMED' },
        },
        _count: { stationId: true },
      }),
    ]);

    return {
      deliveryDate: deliveryDate.toISOString().split('T')[0],
      unitsByStatus,
      unitsByStation,
    };
  }

  async getDispatchSummary(dateStr?: string) {
    const deliveryDate = dateStr ? new Date(dateStr) : new Date();

    const dropsByStatus = await this.prisma.drop.groupBy({
      by: ['status'],
      where: { deliveryDate },
      _count: { status: true },
    });

    return {
      deliveryDate: deliveryDate.toISOString().split('T')[0],
      dropsByStatus,
    };
  }
}
