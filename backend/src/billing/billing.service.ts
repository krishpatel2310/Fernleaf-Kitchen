import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { InvoiceStatus, OrderStatus, Prisma } from '@prisma/client';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { InvoiceQueryDto } from './dto/invoice-query.dto';

export interface FormattedInvoiceOrder {
  invoiceId: string;
  orderId: string;
  invoicedAmountCents: number;
  currentOrderTotalCents: number;
  hasAmountMismatch: boolean;
  amountDifferenceCents: number;
  isOrderCancelled: boolean;
  adjustmentRequired: boolean;
  createdAt: Date;
  order: {
    id: string;
    orderNumber: string;
    deliveryDate: Date;
    deliveryTimeMinutes: number;
    status: OrderStatus;
    totalCents: number;
    cancellationReason?: string | null;
    employee?: {
      id: string;
      firstName: string;
      lastName: string;
      email: string;
    } | null;
    lines?: any[];
  } | null;
}

export interface FormattedInvoiceDetail {
  id: string;
  invoiceNumber: string;
  companyId: string;
  status: InvoiceStatus;
  totalCents: number;
  issuedAt: Date;
  paidAt: Date | null;
  cancelledAt: Date | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  company: any;
  orders: FormattedInvoiceOrder[];
  orderCount: number;
  hasAdjustments: boolean;
  currentOrdersTotalCents: number;
  totalAdjustmentDifferenceCents: number;
}

@Injectable()
export class BillingService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * List all invoices with server-side pagination, company/status filtering, and search.
   */
  async findAllInvoices(query?: InvoiceQueryDto) {
    const page = Math.max(1, query?.page ? Number(query.page) : 1);
    const limit = Math.min(
      100,
      Math.max(1, query?.limit ? Number(query.limit) : 20),
    );
    const skip = (page - 1) * limit;

    const where: Prisma.InvoiceWhereInput = {};
    if (query?.companyId) where.companyId = query.companyId;
    if (query?.status) where.status = query.status;

    if (query?.search) {
      const s = query.search.trim();
      where.OR = [
        { invoiceNumber: { contains: s, mode: 'insensitive' } },
        { company: { name: { contains: s, mode: 'insensitive' } } },
      ];
    }

    const [total, rawInvoices] = await Promise.all([
      this.prisma.invoice.count({ where }),
      this.prisma.invoice.findMany({
        where,
        include: {
          company: {
            select: { id: true, name: true, billingContactEmail: true },
          },
          orders: {
            include: {
              order: {
                select: {
                  id: true,
                  orderNumber: true,
                  status: true,
                  totalCents: true,
                },
              },
            },
          },
        },
        orderBy: { issuedAt: 'desc' },
        skip,
        take: limit,
      }),
    ]);

    const data = rawInvoices.map((inv) => this.formatInvoiceSummary(inv));

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

  /**
   * Retrieve a single invoice with full company info, contained orders,
   * snapshot amounts, and calculated adjustment/mismatch indicators.
   */
  async findOneInvoice(id: string): Promise<FormattedInvoiceDetail> {
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
                lines: {
                  include: {
                    dish: { select: { id: true, name: true } },
                  },
                },
              },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!invoice) {
      throw new NotFoundException(`Invoice with ID '${id}' not found`);
    }

    return this.formatInvoiceDetail(invoice);
  }

  /**
   * Get confirmed uninvoiced orders eligible for invoicing.
   * Can be filtered by companyId or returned across all companies.
   */
  async getUninvoicedConfirmedOrders(companyId?: string) {
    const where: Prisma.OrderWhereInput = {
      status: OrderStatus.CONFIRMED,
      invoiceEntry: null, // Order has not yet been placed on any invoice
    };

    if (companyId) {
      where.companyId = companyId;
    }

    return this.prisma.order.findMany({
      where,
      include: {
        company: {
          select: { id: true, name: true, billingContactEmail: true },
        },
        employee: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        lines: {
          include: {
            dish: { select: { id: true, name: true } },
          },
        },
        delivery: true,
      },
      orderBy: { deliveryDate: 'asc' },
    });
  }

  /**
   * Create an internal invoice grouping confirmed uninvoiced orders for a company.
   * Transactional and concurrency-safe via database constraints.
   */
  async createInvoice(dto: CreateInvoiceDto): Promise<FormattedInvoiceDetail> {
    // 1. Verify company exists
    const company = await this.prisma.company.findUnique({
      where: { id: dto.companyId },
    });
    if (!company) {
      throw new NotFoundException(
        `Company with ID '${dto.companyId}' not found`,
      );
    }

    // 2. Validate orderIds array
    if (!dto.orderIds || dto.orderIds.length === 0) {
      throw new BadRequestException(
        'At least one order must be specified to create an invoice',
      );
    }

    const uniqueOrderIds = Array.from(new Set(dto.orderIds));
    if (uniqueOrderIds.length !== dto.orderIds.length) {
      throw new BadRequestException(
        'Duplicate order IDs provided in invoice request',
      );
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        // 3. Fetch all requested orders
        const orders = await tx.order.findMany({
          where: { id: { in: uniqueOrderIds } },
          include: {
            invoiceEntry: {
              include: {
                invoice: { select: { id: true, invoiceNumber: true } },
              },
            },
            employee: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
              },
            },
            lines: {
              include: {
                dish: { select: { id: true, name: true } },
              },
            },
          },
        });

        if (orders.length !== uniqueOrderIds.length) {
          const foundIds = new Set(orders.map((o) => o.id));
          const missing = uniqueOrderIds.filter((id) => !foundIds.has(id));
          throw new NotFoundException(
            `Orders not found: ${missing.join(', ')}`,
          );
        }

        // 4. Verify all orders belong to the specified company
        for (const order of orders) {
          if (order.companyId !== dto.companyId) {
            throw new BadRequestException(
              `Order '${order.orderNumber}' does not belong to company '${company.name}' (companyId: ${dto.companyId})`,
            );
          }
        }

        // 5. Verify every order is CONFIRMED
        for (const order of orders) {
          if (order.status !== OrderStatus.CONFIRMED) {
            throw new BadRequestException(
              `Order '${order.orderNumber}' is not in CONFIRMED status (current: ${order.status}). Only CONFIRMED orders are eligible for invoicing.`,
            );
          }
        }

        // 6. Verify every order is currently uninvoiced
        for (const order of orders) {
          if (order.invoiceEntry) {
            throw new ConflictException(
              `Order '${order.orderNumber}' is already invoiced on invoice '${order.invoiceEntry.invoice?.invoiceNumber || order.invoiceEntry.invoiceId}'`,
            );
          }
        }

        // 7. Calculate integer cents total strictly
        let totalCents = 0;
        for (const order of orders) {
          if (!Number.isInteger(order.totalCents) || order.totalCents < 0) {
            throw new BadRequestException(
              `Order '${order.orderNumber}' has an invalid total amount: ${order.totalCents}`,
            );
          }
          totalCents += order.totalCents;
        }

        // 8. Generate invoice number if not explicitly specified
        const invoiceNumber =
          dto.invoiceNumber?.trim() || (await this.generateInvoiceNumber(tx));

        // Verify custom invoice number uniqueness if provided
        if (dto.invoiceNumber?.trim()) {
          const existingInv = await tx.invoice.findUnique({
            where: { invoiceNumber },
          });
          if (existingInv) {
            throw new ConflictException(
              `Invoice number '${invoiceNumber}' already exists`,
            );
          }
        }

        // 9. Create Invoice record
        const invoice = await tx.invoice.create({
          data: {
            invoiceNumber,
            companyId: dto.companyId,
            status: InvoiceStatus.ISSUED,
            totalCents,
            notes: dto.notes?.trim() || null,
          },
        });

        // 10. Create InvoiceOrder snapshot rows (enforces unique orderId constraint at DB level)
        await tx.invoiceOrder.createMany({
          data: orders.map((o) => ({
            invoiceId: invoice.id,
            orderId: o.id,
            invoicedAmountCents: o.totalCents,
          })),
        });

        // Fetch complete created invoice for response
        const fullInvoice = await tx.invoice.findUnique({
          where: { id: invoice.id },
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
                    lines: {
                      include: {
                        dish: { select: { id: true, name: true } },
                      },
                    },
                  },
                },
              },
              orderBy: { createdAt: 'asc' },
            },
          },
        });

        return this.formatInvoiceDetail(fullInvoice!);
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'One or more orders are already invoiced concurrently by another process',
        );
      }
      throw error;
    }
  }

  /**
   * Mark an invoice as PAID.
   * Idempotent: repeated calls do not corrupt timestamps or state.
   */
  async markInvoicePaid(id: string): Promise<FormattedInvoiceDetail> {
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
                lines: true,
              },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!invoice) {
      throw new NotFoundException(`Invoice with ID '${id}' not found`);
    }

    if (invoice.status === InvoiceStatus.PAID) {
      return this.formatInvoiceDetail(invoice);
    }

    if (invoice.status === InvoiceStatus.CANCELLED) {
      throw new BadRequestException('Cannot mark a cancelled invoice as paid');
    }

    const updated = await this.prisma.invoice.update({
      where: { id },
      data: {
        status: InvoiceStatus.PAID,
        paidAt: invoice.paidAt || new Date(),
      },
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
                lines: true,
              },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    return this.formatInvoiceDetail(updated);
  }

  /**
   * Deterministically generate the next invoice number e.g. INV-2026-0001
   */
  private async generateInvoiceNumber(tx: any): Promise<string> {
    const currentYear = new Date().getFullYear();
    const prefix = `INV-${currentYear}-`;

    const latest = await tx.invoice.findFirst({
      where: { invoiceNumber: { startsWith: prefix } },
      orderBy: { invoiceNumber: 'desc' },
      select: { invoiceNumber: true },
    });

    let nextSeq = 1;
    if (latest?.invoiceNumber) {
      const parts = latest.invoiceNumber.split('-');
      const lastNum = parseInt(parts[parts.length - 1], 10);
      if (!isNaN(lastNum)) {
        nextSeq = lastNum + 1;
      }
    }

    return `${prefix}${String(nextSeq).padStart(4, '0')}`;
  }

  /**
   * Format full invoice detail with calculated mismatch and adjustment fields.
   */
  private formatInvoiceDetail(invoice: any): FormattedInvoiceDetail {
    const orders: FormattedInvoiceOrder[] = (invoice.orders || []).map(
      (io: any) => {
        const currentOrder = io.order;
        const invoicedAmountCents = io.invoicedAmountCents;
        const currentOrderTotalCents =
          currentOrder?.totalCents ?? invoicedAmountCents;
        const hasAmountMismatch =
          currentOrderTotalCents !== invoicedAmountCents;
        const amountDifferenceCents =
          currentOrderTotalCents - invoicedAmountCents;
        const isOrderCancelled = currentOrder?.status === OrderStatus.CANCELLED;
        const adjustmentRequired = hasAmountMismatch || isOrderCancelled;

        return {
          invoiceId: io.invoiceId,
          orderId: io.orderId,
          invoicedAmountCents,
          currentOrderTotalCents,
          hasAmountMismatch,
          amountDifferenceCents,
          isOrderCancelled,
          adjustmentRequired,
          createdAt: io.createdAt,
          order: currentOrder
            ? {
                id: currentOrder.id,
                orderNumber: currentOrder.orderNumber,
                deliveryDate: currentOrder.deliveryDate,
                deliveryTimeMinutes: currentOrder.deliveryTimeMinutes,
                status: currentOrder.status,
                totalCents: currentOrder.totalCents,
                cancellationReason: currentOrder.cancellationReason,
                employee: currentOrder.employee,
                lines: currentOrder.lines,
              }
            : null,
        };
      },
    );

    const currentOrdersTotalCents = orders.reduce(
      (sum, o) => sum + o.currentOrderTotalCents,
      0,
    );
    const totalAdjustmentDifferenceCents = orders.reduce(
      (sum, o) => sum + o.amountDifferenceCents,
      0,
    );
    const hasAdjustments = orders.some((o) => o.adjustmentRequired);

    return {
      id: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      companyId: invoice.companyId,
      status: invoice.status,
      totalCents: invoice.totalCents, // Immutable historical snapshot
      issuedAt: invoice.issuedAt,
      paidAt: invoice.paidAt,
      cancelledAt: invoice.cancelledAt,
      notes: invoice.notes,
      createdAt: invoice.createdAt,
      updatedAt: invoice.updatedAt,
      company: invoice.company,
      orders,
      orderCount: orders.length,
      hasAdjustments,
      currentOrdersTotalCents,
      totalAdjustmentDifferenceCents,
    };
  }

  /**
   * Format invoice summary for list view.
   */
  private formatInvoiceSummary(inv: any) {
    const orders = inv.orders || [];
    let hasAdjustments = false;
    let currentOrdersTotalCents = 0;

    for (const io of orders) {
      const order = io.order;
      const currentTotal = order?.totalCents ?? io.invoicedAmountCents;
      currentOrdersTotalCents += currentTotal;
      if (
        currentTotal !== io.invoicedAmountCents ||
        order?.status === OrderStatus.CANCELLED
      ) {
        hasAdjustments = true;
      }
    }

    return {
      id: inv.id,
      invoiceNumber: inv.invoiceNumber,
      companyId: inv.companyId,
      status: inv.status,
      totalCents: inv.totalCents,
      issuedAt: inv.issuedAt,
      paidAt: inv.paidAt,
      notes: inv.notes,
      company: inv.company,
      orderCount: orders.length,
      hasAdjustments,
      currentOrdersTotalCents,
      totalAdjustmentDifferenceCents: currentOrdersTotalCents - inv.totalCents,
      createdAt: inv.createdAt,
      updatedAt: inv.updatedAt,
    };
  }
}
