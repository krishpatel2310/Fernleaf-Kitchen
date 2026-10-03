import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { InvoiceStatus } from '@prisma/client';

@Injectable()
export class BillingService {
  constructor(private readonly prisma: PrismaService) {}

  async findAllInvoices(companyId?: string, status?: InvoiceStatus) {
    const where: any = {};
    if (companyId) where.companyId = companyId;
    if (status) where.status = status;

    return this.prisma.invoice.findMany({
      where,
      include: {
        company: {
          select: { id: true, name: true, billingContactEmail: true },
        },
        _count: { select: { orders: true } },
      },
      orderBy: { issuedAt: 'desc' },
    });
  }

  async findOneInvoice(id: string) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id },
      include: {
        company: true,
        orders: {
          include: {
            order: {
              include: {
                employee: {
                  select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    email: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!invoice) {
      throw new NotFoundException(`Invoice with ID '${id}' not found`);
    }

    return invoice;
  }

  async getUninvoicedConfirmedOrders(companyId: string) {
    return this.prisma.order.findMany({
      where: {
        companyId,
        status: 'CONFIRMED',
        invoiceEntry: null, // Order has not yet been placed on any invoice
      },
      include: {
        employee: { select: { id: true, firstName: true, lastName: true } },
        lines: true,
      },
      orderBy: { deliveryDate: 'asc' },
    });
  }
}
