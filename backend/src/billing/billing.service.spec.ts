import { Test, TestingModule } from '@nestjs/testing';
import { BillingService } from './billing.service';
import { PrismaService } from '../prisma/prisma.service';
import { InvoiceStatus, OrderStatus, Prisma } from '@prisma/client';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { BillingController } from './billing.controller';
import { PERMISSIONS_KEY } from '../auth/decorators/require-permissions.decorator';

describe('BillingService (Unit Tests)', () => {
  let service: BillingService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      company: {
        findUnique: jest.fn(),
      },
      order: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      invoice: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        count: jest.fn(),
      },
      invoiceOrder: {
        createMany: jest.fn(),
      },
      $transaction: jest.fn(async (cb) => cb(prisma)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [BillingService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<BillingService>(BillingService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('1 & 2. Invoice creation from confirmed uninvoiced orders (Single & Multiple)', () => {
    it('creates an invoice grouping multiple confirmed uninvoiced orders for a company', async () => {
      const companyId = 'comp-1';
      prisma.company.findUnique.mockResolvedValue({
        id: companyId,
        name: 'Acme Corp',
      });

      const orders = [
        {
          id: 'ord-1',
          orderNumber: 'FK-2026-0001',
          companyId,
          status: OrderStatus.CONFIRMED,
          totalCents: 1500,
          invoiceEntry: null,
          employee: {
            id: 'emp-1',
            firstName: 'John',
            lastName: 'Doe',
            email: 'john@acme.com',
          },
          lines: [],
        },
        {
          id: 'ord-2',
          orderNumber: 'FK-2026-0002',
          companyId,
          status: OrderStatus.CONFIRMED,
          totalCents: 2500,
          invoiceEntry: null,
          employee: {
            id: 'emp-2',
            firstName: 'Jane',
            lastName: 'Doe',
            email: 'jane@acme.com',
          },
          lines: [],
        },
      ];

      prisma.order.findMany.mockResolvedValue(orders);
      prisma.invoice.findFirst.mockResolvedValue(null); // for auto-numbering
      prisma.invoice.create.mockResolvedValue({
        id: 'inv-1',
        invoiceNumber: 'INV-2026-0001',
        companyId,
        status: InvoiceStatus.ISSUED,
        totalCents: 4000,
        notes: 'Monthly billing',
        issuedAt: new Date(),
        paidAt: null,
        cancelledAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      prisma.invoice.findUnique.mockResolvedValue({
        id: 'inv-1',
        invoiceNumber: 'INV-2026-0001',
        companyId,
        status: InvoiceStatus.ISSUED,
        totalCents: 4000,
        notes: 'Monthly billing',
        issuedAt: new Date(),
        paidAt: null,
        cancelledAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        company: { id: companyId, name: 'Acme Corp' },
        orders: [
          {
            invoiceId: 'inv-1',
            orderId: 'ord-1',
            invoicedAmountCents: 1500,
            createdAt: new Date(),
            order: orders[0],
          },
          {
            invoiceId: 'inv-1',
            orderId: 'ord-2',
            invoicedAmountCents: 2500,
            createdAt: new Date(),
            order: orders[1],
          },
        ],
      });

      const result = await service.createInvoice({
        companyId,
        orderIds: ['ord-1', 'ord-2'],
        notes: 'Monthly billing',
      });

      expect(result.id).toBe('inv-1');
      expect(result.invoiceNumber).toBe('INV-2026-0001');
      expect(result.totalCents).toBe(4000);
      expect(result.orderCount).toBe(2);
      expect(result.hasAdjustments).toBe(false);
      expect(prisma.invoiceOrder.createMany).toHaveBeenCalledWith({
        data: [
          { invoiceId: 'inv-1', orderId: 'ord-1', invoicedAmountCents: 1500 },
          { invoiceId: 'inv-1', orderId: 'ord-2', invoicedAmountCents: 2500 },
        ],
      });
    });
  });

  describe('3. An order cannot belong to two invoices', () => {
    it('rejects invoice creation if an order is already invoiced', async () => {
      const companyId = 'comp-1';
      prisma.company.findUnique.mockResolvedValue({
        id: companyId,
        name: 'Acme Corp',
      });

      prisma.order.findMany.mockResolvedValue([
        {
          id: 'ord-1',
          orderNumber: 'FK-2026-0001',
          companyId,
          status: OrderStatus.CONFIRMED,
          totalCents: 1500,
          invoiceEntry: {
            invoiceId: 'inv-existing',
            invoice: { id: 'inv-existing', invoiceNumber: 'INV-2026-0099' },
          },
        },
      ]);

      await expect(
        service.createInvoice({
          companyId,
          orderIds: ['ord-1'],
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('4. Draft/placed/cancelled/rejected orders cannot be newly invoiced', () => {
    const invalidStatuses = [
      OrderStatus.DRAFT,
      OrderStatus.PLACED,
      OrderStatus.CANCELLED,
      OrderStatus.REJECTED,
      OrderStatus.DELIVERED,
    ];

    it.each(invalidStatuses)(
      'rejects invoicing an order with status %s',
      async (status) => {
        const companyId = 'comp-1';
        prisma.company.findUnique.mockResolvedValue({
          id: companyId,
          name: 'Acme Corp',
        });

        prisma.order.findMany.mockResolvedValue([
          {
            id: 'ord-invalid',
            orderNumber: 'FK-2026-9999',
            companyId,
            status,
            totalCents: 1200,
            invoiceEntry: null,
          },
        ]);

        await expect(
          service.createInvoice({
            companyId,
            orderIds: ['ord-invalid'],
          }),
        ).rejects.toThrow(BadRequestException);
      },
    );
  });

  describe('5. Order from another company cannot be added to invoice', () => {
    it('rejects invoicing an order that belongs to a different company', async () => {
      const companyId = 'comp-1';
      prisma.company.findUnique.mockResolvedValue({
        id: companyId,
        name: 'Acme Corp',
      });

      prisma.order.findMany.mockResolvedValue([
        {
          id: 'ord-other-comp',
          orderNumber: 'FK-2026-0001',
          companyId: 'comp-other',
          status: OrderStatus.CONFIRMED,
          totalCents: 1500,
          invoiceEntry: null,
        },
      ]);

      await expect(
        service.createInvoice({
          companyId,
          orderIds: ['ord-other-comp'],
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('6. Invoice total equals sum of invoiced order snapshots (integer cents)', () => {
    it('calculates total strictly using integer cents summation', async () => {
      const companyId = 'comp-1';
      prisma.company.findUnique.mockResolvedValue({
        id: companyId,
        name: 'Acme Corp',
      });

      const orders = [
        {
          id: 'ord-1',
          orderNumber: 'FK-2026-0001',
          companyId,
          status: OrderStatus.CONFIRMED,
          totalCents: 1235,
          invoiceEntry: null,
        },
        {
          id: 'ord-2',
          orderNumber: 'FK-2026-0002',
          companyId,
          status: OrderStatus.CONFIRMED,
          totalCents: 8765,
          invoiceEntry: null,
        },
      ];

      prisma.order.findMany.mockResolvedValue(orders);
      prisma.invoice.findFirst.mockResolvedValue(null);
      prisma.invoice.create.mockResolvedValue({
        id: 'inv-1',
        invoiceNumber: 'INV-2026-0001',
        companyId,
        status: InvoiceStatus.ISSUED,
        totalCents: 10000,
      });

      prisma.invoice.findUnique.mockResolvedValue({
        id: 'inv-1',
        invoiceNumber: 'INV-2026-0001',
        companyId,
        status: InvoiceStatus.ISSUED,
        totalCents: 10000,
        orders: orders.map((o) => ({
          invoiceId: 'inv-1',
          orderId: o.id,
          invoicedAmountCents: o.totalCents,
          order: o,
        })),
      });

      const res = await service.createInvoice({
        companyId,
        orderIds: ['ord-1', 'ord-2'],
      });

      expect(res.totalCents).toBe(10000);
      expect(Number.isInteger(res.totalCents)).toBe(true);
    });
  });

  describe('7 & 8. Mark invoice paid and repeated mark-paid safety', () => {
    it('marks an unpaid invoice as PAID with paidAt timestamp', async () => {
      const invoiceId = 'inv-1';
      const unpaidInvoice = {
        id: invoiceId,
        status: InvoiceStatus.ISSUED,
        paidAt: null,
        orders: [],
      };

      prisma.invoice.findUnique.mockResolvedValue(unpaidInvoice);
      prisma.invoice.update.mockResolvedValue({
        ...unpaidInvoice,
        status: InvoiceStatus.PAID,
        paidAt: new Date(),
      });

      const res = await service.markInvoicePaid(invoiceId);

      expect(res.status).toBe(InvoiceStatus.PAID);
      expect(res.paidAt).toBeDefined();
      expect(prisma.invoice.update).toHaveBeenCalled();
    });

    it('is safe and idempotent when markInvoicePaid is called repeatedly', async () => {
      const invoiceId = 'inv-1';
      const originalPaidAt = new Date('2026-10-01T12:00:00Z');
      const alreadyPaidInvoice = {
        id: invoiceId,
        status: InvoiceStatus.PAID,
        paidAt: originalPaidAt,
        orders: [],
      };

      prisma.invoice.findUnique.mockResolvedValue(alreadyPaidInvoice);

      const res = await service.markInvoicePaid(invoiceId);

      expect(res.status).toBe(InvoiceStatus.PAID);
      expect(res.paidAt).toBe(originalPaidAt);
      expect(prisma.invoice.update).not.toHaveBeenCalled();
    });
  });

  describe('9 & 10. Post-invoicing order changes & mismatch surfacing', () => {
    it('preserves historical snapshot amount and exposes mismatch when order amount changes', async () => {
      const invoiceId = 'inv-1';
      const invoicedSnapshotCents = 10000;
      const currentOrderTotalCents = 11000; // order changed later

      prisma.invoice.findUnique.mockResolvedValue({
        id: invoiceId,
        invoiceNumber: 'INV-2026-0001',
        companyId: 'comp-1',
        status: InvoiceStatus.ISSUED,
        totalCents: invoicedSnapshotCents, // historical total
        orders: [
          {
            invoiceId,
            orderId: 'ord-1',
            invoicedAmountCents: invoicedSnapshotCents, // snapshot
            order: {
              id: 'ord-1',
              orderNumber: 'FK-2026-0001',
              status: OrderStatus.CONFIRMED,
              totalCents: currentOrderTotalCents, // current mutated total
            },
          },
        ],
      });

      const res = await service.findOneInvoice(invoiceId);

      // Invariant: invoice totalCents remains untouched
      expect(res.totalCents).toBe(10000);
      expect(res.orders[0].invoicedAmountCents).toBe(10000);
      expect(res.orders[0].currentOrderTotalCents).toBe(11000);
      expect(res.orders[0].hasAmountMismatch).toBe(true);
      expect(res.orders[0].amountDifferenceCents).toBe(1000);
      expect(res.orders[0].adjustmentRequired).toBe(true);
      expect(res.hasAdjustments).toBe(true);
      expect(res.currentOrdersTotalCents).toBe(11000);
      expect(res.totalAdjustmentDifferenceCents).toBe(1000);
    });
  });

  describe('11. Confirmed cancellation after invoicing does not silently remove order', () => {
    it('retains invoiced order and exposes cancelled adjustment state', async () => {
      const invoiceId = 'inv-1';
      const invoicedSnapshotCents = 2500;

      prisma.invoice.findUnique.mockResolvedValue({
        id: invoiceId,
        invoiceNumber: 'INV-2026-0001',
        companyId: 'comp-1',
        status: InvoiceStatus.ISSUED,
        totalCents: invoicedSnapshotCents,
        orders: [
          {
            invoiceId,
            orderId: 'ord-1',
            invoicedAmountCents: invoicedSnapshotCents,
            order: {
              id: 'ord-1',
              orderNumber: 'FK-2026-0001',
              status: OrderStatus.CANCELLED, // Order was cancelled after invoice issuance
              totalCents: invoicedSnapshotCents,
              cancellationReason:
                'Client changed requirements post-confirmation',
            },
          },
        ],
      });

      const res = await service.findOneInvoice(invoiceId);

      expect(res.totalCents).toBe(2500);
      expect(res.orderCount).toBe(1);
      expect(res.orders[0].isOrderCancelled).toBe(true);
      expect(res.orders[0].adjustmentRequired).toBe(true);
      expect(res.hasAdjustments).toBe(true);
    });
  });

  describe('12, 13, 14. Authorization permissions verification', () => {
    it('verifies BillingController enforces billing.read and billing.manage permissions', () => {
      const reflector = new Reflector();

      const readPermsInvoices = reflector.get<string[]>(
        PERMISSIONS_KEY,
        BillingController.prototype.findAllInvoices,
      );
      expect(readPermsInvoices).toEqual(['billing.read']);

      const readPermsOneInvoice = reflector.get<string[]>(
        PERMISSIONS_KEY,
        BillingController.prototype.findOneInvoice,
      );
      expect(readPermsOneInvoice).toEqual(['billing.read']);

      const readPermsUninvoiced = reflector.get<string[]>(
        PERMISSIONS_KEY,
        BillingController.prototype.getUninvoicedConfirmedOrders,
      );
      expect(readPermsUninvoiced).toEqual(['billing.read']);

      const managePermsCreate = reflector.get<string[]>(
        PERMISSIONS_KEY,
        BillingController.prototype.createInvoice,
      );
      expect(managePermsCreate).toEqual(['billing.manage']);

      const managePermsMarkPaid = reflector.get<string[]>(
        PERMISSIONS_KEY,
        BillingController.prototype.markInvoicePaid,
      );
      expect(managePermsMarkPaid).toEqual(['billing.manage']);
    });
  });

  describe('15. Concurrent invoice creation collision handling', () => {
    it('catches database unique constraint violation (P2002) and throws ConflictException', async () => {
      const companyId = 'comp-1';
      prisma.company.findUnique.mockResolvedValue({
        id: companyId,
        name: 'Acme Corp',
      });

      prisma.order.findMany.mockResolvedValue([
        {
          id: 'ord-1',
          orderNumber: 'FK-2026-0001',
          companyId,
          status: OrderStatus.CONFIRMED,
          totalCents: 1500,
          invoiceEntry: null,
        },
      ]);

      const p2002Error = new Prisma.PrismaClientKnownRequestError(
        'Unique constraint failed on orderId',
        {
          code: 'P2002',
          clientVersion: '5.0.0',
        },
      );

      prisma.invoice.create.mockRejectedValue(p2002Error);

      await expect(
        service.createInvoice({
          companyId,
          orderIds: ['ord-1'],
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('16. Pagination and filtering on findAllInvoices', () => {
    it('applies company, status, search, and pagination filters correctly', async () => {
      prisma.invoice.count.mockResolvedValue(45);
      prisma.invoice.findMany.mockResolvedValue([
        {
          id: 'inv-1',
          invoiceNumber: 'INV-2026-0010',
          companyId: 'comp-1',
          status: InvoiceStatus.ISSUED,
          totalCents: 5000,
          issuedAt: new Date(),
          company: {
            id: 'comp-1',
            name: 'Acme Corp',
            billingContactEmail: 'bill@acme.com',
          },
          orders: [],
        },
      ]);

      const result = await service.findAllInvoices({
        companyId: 'comp-1',
        status: InvoiceStatus.ISSUED,
        page: 2,
        limit: 10,
        search: 'Acme',
      });

      expect(prisma.invoice.count).toHaveBeenCalledWith({
        where: {
          companyId: 'comp-1',
          status: InvoiceStatus.ISSUED,
          OR: [
            { invoiceNumber: { contains: 'Acme', mode: 'insensitive' } },
            { company: { name: { contains: 'Acme', mode: 'insensitive' } } },
          ],
        },
      });

      expect(prisma.invoice.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 10,
          take: 10,
        }),
      );

      expect(result.meta).toEqual({
        total: 45,
        page: 2,
        limit: 10,
        totalPages: 5,
      });
      expect(result.data).toHaveLength(1);
    });
  });
});
