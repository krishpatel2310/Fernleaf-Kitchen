import { Test, TestingModule } from '@nestjs/testing';
import {
  DispatchService,
  calculateScheduledDeliveryUtc,
  getKolkataTodayString,
  parseKolkataCalendarDate,
  formatMinutesToTime,
} from './dispatch.service';
import { PrismaService } from '../prisma/prisma.service';
import { DropStatus, OrderStatus } from '@prisma/client';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { AuthenticatedUser } from '../auth/decorators/current-user.decorator';

function mockUser(
  id: string,
  roleName: string,
  permissions: string[] = [],
): AuthenticatedUser {
  return {
    id,
    email: `${id}@test.com`,
    name: `${id} Name`,
    roleId: `role-${roleName.toLowerCase()}`,
    roleName,
    permissions,
  };
}

describe('DispatchService (Unit Tests)', () => {
  let service: DispatchService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      drop: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        deleteMany: jest.fn(),
        count: jest.fn(),
      },
      order: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      dropOrder: {
        create: jest.fn(),
        upsert: jest.fn(),
        delete: jest.fn(),
        count: jest.fn(),
      },
      user: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
      },
      deliveryRecord: {
        upsert: jest.fn(),
        create: jest.fn(),
      },
      orderEvent: {
        create: jest.fn(),
      },
      $transaction: jest.fn(async (cb) => cb(prisma)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DispatchService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<DispatchService>(DispatchService);
  });

  // ===========================================================================
  // GROUP A: Drop Grouping Invariant
  // ===========================================================================
  describe('Group A: Drop Grouping Invariants', () => {
    it('groups orders with same company, same address, and exact same time into ONE drop', async () => {
      const deliveryDate = parseKolkataCalendarDate('2026-10-03');
      const orders = [
        {
          id: 'ord-1',
          companyId: 'comp-1',
          deliveryDate,
          company: { id: 'comp-1', defaultDriverId: null },
          delivery: {
            deliveryTimeMinutes: 780,
            companyAddressId: 'addr-1',
            addressLine1Snapshot: 'Line 1',
            citySnapshot: 'Bangalore',
            stateSnapshot: 'KA',
            postalCodeSnapshot: '560100',
          },
          dropOrder: null,
          kitchenReadyAt: null,
        },
        {
          id: 'ord-2',
          companyId: 'comp-1',
          deliveryDate,
          company: { id: 'comp-1', defaultDriverId: null },
          delivery: {
            deliveryTimeMinutes: 780,
            companyAddressId: 'addr-1',
            addressLine1Snapshot: 'Line 1',
            citySnapshot: 'Bangalore',
            stateSnapshot: 'KA',
            postalCodeSnapshot: '560100',
          },
          dropOrder: null,
          kitchenReadyAt: null,
        },
      ];

      prisma.order.findMany.mockResolvedValue(orders);
      prisma.drop.findUnique
        .mockResolvedValueOnce(null) // first order: drop not created yet
        .mockResolvedValueOnce({ id: 'drop-1' }); // second order: drop exists
      prisma.drop.create.mockResolvedValue({ id: 'drop-1' });
      prisma.dropOrder.upsert.mockResolvedValue({});
      prisma.drop.findMany.mockResolvedValue([]);
      prisma.drop.count.mockResolvedValue(1);

      const result = await service.generateDropsForDate('2026-10-03');

      expect(prisma.drop.create).toHaveBeenCalledTimes(1);
      expect(prisma.dropOrder.upsert).toHaveBeenCalledTimes(2);
      expect(result.dropsCreated).toBe(1);
    });

    it('splits orders with different delivery times into separate drops', async () => {
      const deliveryDate = parseKolkataCalendarDate('2026-10-03');
      const orders = [
        {
          id: 'ord-1',
          companyId: 'comp-1',
          deliveryDate,
          company: { id: 'comp-1', defaultDriverId: null },
          delivery: {
            deliveryTimeMinutes: 750, // 12:30
            companyAddressId: 'addr-1',
            addressLine1Snapshot: 'Line 1',
            citySnapshot: 'Bangalore',
            stateSnapshot: 'KA',
            postalCodeSnapshot: '560100',
          },
          dropOrder: null,
          kitchenReadyAt: null,
        },
        {
          id: 'ord-2',
          companyId: 'comp-1',
          deliveryDate,
          company: { id: 'comp-1', defaultDriverId: null },
          delivery: {
            deliveryTimeMinutes: 810, // 13:30 (different time)
            companyAddressId: 'addr-1',
            addressLine1Snapshot: 'Line 1',
            citySnapshot: 'Bangalore',
            stateSnapshot: 'KA',
            postalCodeSnapshot: '560100',
          },
          dropOrder: null,
          kitchenReadyAt: null,
        },
      ];

      prisma.order.findMany.mockResolvedValue(orders);
      prisma.drop.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);
      prisma.drop.create
        .mockResolvedValueOnce({ id: 'drop-1' })
        .mockResolvedValueOnce({ id: 'drop-2' });
      prisma.dropOrder.upsert.mockResolvedValue({});
      prisma.drop.findMany.mockResolvedValue([]);
      prisma.drop.count.mockResolvedValue(2);

      const result = await service.generateDropsForDate('2026-10-03');

      expect(prisma.drop.create).toHaveBeenCalledTimes(2);
      expect(result.dropsCreated).toBe(2);
    });

    it('splits orders with different companies at same address into separate drops', async () => {
      const deliveryDate = parseKolkataCalendarDate('2026-10-03');
      const orders = [
        {
          id: 'ord-1',
          companyId: 'comp-1',
          deliveryDate,
          company: { id: 'comp-1', defaultDriverId: null },
          delivery: {
            deliveryTimeMinutes: 780,
            companyAddressId: 'addr-shared',
            addressLine1Snapshot: 'Shared Tech Park',
            citySnapshot: 'Bangalore',
            stateSnapshot: 'KA',
            postalCodeSnapshot: '560100',
          },
          dropOrder: null,
          kitchenReadyAt: null,
        },
        {
          id: 'ord-2',
          companyId: 'comp-2', // Different company
          deliveryDate,
          company: { id: 'comp-2', defaultDriverId: null },
          delivery: {
            deliveryTimeMinutes: 780,
            companyAddressId: 'addr-shared',
            addressLine1Snapshot: 'Shared Tech Park',
            citySnapshot: 'Bangalore',
            stateSnapshot: 'KA',
            postalCodeSnapshot: '560100',
          },
          dropOrder: null,
          kitchenReadyAt: null,
        },
      ];

      prisma.order.findMany.mockResolvedValue(orders);
      prisma.drop.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);
      prisma.drop.create
        .mockResolvedValueOnce({ id: 'drop-comp1' })
        .mockResolvedValueOnce({ id: 'drop-comp2' });
      prisma.dropOrder.upsert.mockResolvedValue({});
      prisma.drop.findMany.mockResolvedValue([]);
      prisma.drop.count.mockResolvedValue(2);

      const result = await service.generateDropsForDate('2026-10-03');

      expect(prisma.drop.create).toHaveBeenCalledTimes(2);
      expect(result.dropsCreated).toBe(2);
    });

    it('drop generation is completely idempotent on repeated runs', async () => {
      const deliveryDate = parseKolkataCalendarDate('2026-10-03');
      const existingDrop = {
        id: 'drop-1',
        companyId: 'comp-1',
        deliveryDate,
        deliveryTimeMinutes: 780,
        addressKey: 'addr-1',
      };
      const orders = [
        {
          id: 'ord-1',
          companyId: 'comp-1',
          deliveryDate,
          delivery: {
            deliveryTimeMinutes: 780,
            companyAddressId: 'addr-1',
          },
          dropOrder: { drop: existingDrop },
        },
      ];

      prisma.order.findMany.mockResolvedValue(orders);
      prisma.drop.findMany.mockResolvedValue([]);
      prisma.drop.count.mockResolvedValue(1);

      const result = await service.generateDropsForDate('2026-10-03');

      expect(prisma.drop.create).not.toHaveBeenCalled();
      expect(result.dropsCreated).toBe(0);
    });
  });

  // ===========================================================================
  // GROUP B: Driver Assignment & Default Driver
  // ===========================================================================
  describe('Group B: Driver Assignment & Default Driver', () => {
    it('assigns company default driver upon drop creation if driver is active and eligible', async () => {
      const deliveryDate = parseKolkataCalendarDate('2026-10-03');
      const orders = [
        {
          id: 'ord-1',
          companyId: 'comp-1',
          deliveryDate,
          company: { id: 'comp-1', defaultDriverId: 'driver-123' },
          delivery: {
            deliveryTimeMinutes: 780,
            companyAddressId: 'addr-1',
            addressLine1Snapshot: 'Line 1',
            citySnapshot: 'Bangalore',
            stateSnapshot: 'KA',
            postalCodeSnapshot: '560100',
          },
          dropOrder: null,
          kitchenReadyAt: null,
        },
      ];

      prisma.order.findMany.mockResolvedValue(orders);
      prisma.drop.findUnique.mockResolvedValue(null);
      prisma.user.findFirst.mockResolvedValue({
        id: 'driver-123',
        status: 'ACTIVE',
        role: { name: 'DRIVER', permissions: [] },
      });
      prisma.drop.create.mockResolvedValue({ id: 'drop-1' });
      prisma.dropOrder.upsert.mockResolvedValue({});
      prisma.drop.findMany.mockResolvedValue([]);
      prisma.drop.count.mockResolvedValue(1);

      await service.generateDropsForDate('2026-10-03');

      expect(prisma.drop.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            driverId: 'driver-123',
          }),
        }),
      );
    });

    it('leaves drop unassigned if company has no default driver', async () => {
      const deliveryDate = parseKolkataCalendarDate('2026-10-03');
      const orders = [
        {
          id: 'ord-1',
          companyId: 'comp-1',
          deliveryDate,
          company: { id: 'comp-1', defaultDriverId: null },
          delivery: {
            deliveryTimeMinutes: 780,
            companyAddressId: 'addr-1',
            addressLine1Snapshot: 'Line 1',
            citySnapshot: 'Bangalore',
            stateSnapshot: 'KA',
            postalCodeSnapshot: '560100',
          },
          dropOrder: null,
          kitchenReadyAt: null,
        },
      ];

      prisma.order.findMany.mockResolvedValue(orders);
      prisma.drop.findUnique.mockResolvedValue(null);
      prisma.drop.create.mockResolvedValue({ id: 'drop-1' });
      prisma.dropOrder.upsert.mockResolvedValue({});
      prisma.drop.findMany.mockResolvedValue([]);
      prisma.drop.count.mockResolvedValue(1);

      await service.generateDropsForDate('2026-10-03');

      expect(prisma.drop.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            driverId: null,
          }),
        }),
      );
    });

    it('rejects manual driver assignment if user is inactive or not driver-eligible', async () => {
      prisma.drop.findUnique.mockResolvedValue({
        id: 'drop-1',
        status: DropStatus.KITCHEN_READY,
      });
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-kitchen',
        status: 'ACTIVE',
        role: { name: 'KITCHEN', permissions: [] },
      });

      await expect(
        service.assignDriver('drop-1', 'user-kitchen'),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects driver assignment on an already delivered drop', async () => {
      prisma.drop.findUnique.mockResolvedValue({
        id: 'drop-1',
        status: DropStatus.DELIVERED,
      });

      await expect(service.assignDriver('drop-1', 'driver-1')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // ===========================================================================
  // GROUP C: Dispatch Lifecycle & State Machine
  // ===========================================================================
  describe('Group C: Dispatch Lifecycle Transitions', () => {
    it('marks drop dispatch-ready when all contained orders are kitchen-ready', async () => {
      const drop = {
        id: 'drop-1',
        status: DropStatus.KITCHEN_READY,
        deliveryDate: new Date('2026-10-03T00:00:00Z'),
        deliveryTimeMinutes: 780,
        orders: [
          { order: { id: 'ord-1', kitchenReadyAt: new Date() } },
          { order: { id: 'ord-2', kitchenReadyAt: new Date() } },
        ],
      };
      prisma.drop.findUnique.mockResolvedValue(drop);
      prisma.drop.update.mockResolvedValue({
        ...drop,
        status: DropStatus.DISPATCH_READY,
      });

      const result = await service.markDispatchReady('drop-1');

      expect(result.status).toBe(DropStatus.DISPATCH_READY);
      expect(prisma.order.updateMany).toHaveBeenCalledTimes(2);
      expect(prisma.orderEvent.create).toHaveBeenCalledTimes(2);
    });

    it('rejects dispatch-ready if some contained orders are not kitchen-ready', async () => {
      const drop = {
        id: 'drop-1',
        status: DropStatus.KITCHEN_READY,
        orders: [
          { order: { id: 'ord-1', kitchenReadyAt: new Date() } },
          { order: { id: 'ord-2', kitchenReadyAt: null } }, // Incomplete!
        ],
      };
      prisma.drop.findUnique.mockResolvedValue(drop);

      await expect(service.markDispatchReady('drop-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('transitions DISPATCH_READY to OUT_FOR_DELIVERY when driver is assigned', async () => {
      const drop = {
        id: 'drop-1',
        status: DropStatus.DISPATCH_READY,
        driverId: 'driver-1',
        deliveryDate: new Date('2026-10-03T00:00:00Z'),
        deliveryTimeMinutes: 780,
        orders: [{ order: { id: 'ord-1' } }],
      };
      prisma.drop.findUnique.mockResolvedValue(drop);
      prisma.drop.update.mockResolvedValue({
        ...drop,
        status: DropStatus.OUT_FOR_DELIVERY,
      });

      const result = await service.markOutForDelivery('drop-1');

      expect(result.status).toBe(DropStatus.OUT_FOR_DELIVERY);
      expect(prisma.order.updateMany).toHaveBeenCalled();
      expect(prisma.orderEvent.create).toHaveBeenCalled();
    });

    it('rejects out-for-delivery transition if no driver is assigned', async () => {
      const drop = {
        id: 'drop-1',
        status: DropStatus.DISPATCH_READY,
        driverId: null, // Unassigned!
        orders: [{ order: { id: 'ord-1' } }],
      };
      prisma.drop.findUnique.mockResolvedValue(drop);

      await expect(service.markOutForDelivery('drop-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects out-for-delivery from KITCHEN_READY (cannot skip DISPATCH_READY)', async () => {
      const drop = {
        id: 'drop-1',
        status: DropStatus.KITCHEN_READY,
        driverId: 'driver-1',
        orders: [{ order: { id: 'ord-1' } }],
      };
      prisma.drop.findUnique.mockResolvedValue(drop);

      await expect(service.markOutForDelivery('drop-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects duplicate dispatch-ready transition with 409 Conflict', async () => {
      const drop = {
        id: 'drop-1',
        status: DropStatus.DISPATCH_READY,
        orders: [{ order: { id: 'ord-1', kitchenReadyAt: new Date() } }],
      };
      prisma.drop.findUnique.mockResolvedValue(drop);

      await expect(service.markDispatchReady('drop-1')).rejects.toThrow(
        ConflictException,
      );
    });
  });

  // ===========================================================================
  // GROUP D: Driver Data Scoping
  // ===========================================================================
  describe('Group D: Driver Data Scoping', () => {
    it('enforces driverId equals authenticated user id and date is today in Asia/Kolkata', async () => {
      const todayKolkata = getKolkataTodayString();
      prisma.drop.findMany.mockResolvedValue([]);
      prisma.order.findMany.mockResolvedValue([]);
      prisma.drop.count.mockResolvedValue(0);

      const result = await service.findDriverDrops('driver-abc');

      expect(result.driverId).toBe('driver-abc');
      expect(result.date).toBe(todayKolkata);
      expect(prisma.drop.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            driverId: 'driver-abc',
          }),
        }),
      );
    });

    it('ignores requests by driver for other dates and enforces today', async () => {
      const todayKolkata = getKolkataTodayString();
      prisma.drop.findMany.mockResolvedValue([]);
      prisma.order.findMany.mockResolvedValue([]);
      prisma.drop.count.mockResolvedValue(0);

      // Attempt to view tomorrow
      const result = await service.findDriverDrops('driver-abc', '2099-12-31');

      expect(result.date).toBe(todayKolkata);
    });

    it('driver cannot retrieve single drop belonging to another driver', async () => {
      prisma.drop.findUnique.mockResolvedValue({
        id: 'drop-1',
        driverId: 'driver-xyz', // Belongs to different driver
      });

      const caller = mockUser('driver-abc', 'DRIVER', [
        'driver.read_own_deliveries',
      ]);

      await expect(service.findOneDrop('drop-1', caller)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  // ===========================================================================
  // GROUP E: Delivered Transition & Proof of Delivery
  // ===========================================================================
  describe('Group E: Delivered Workflow', () => {
    it('assigned driver can mark OUT_FOR_DELIVERY drop as DELIVERED with note and photo', async () => {
      const deliveryDate = parseKolkataCalendarDate('2026-10-03');
      const drop = {
        id: 'drop-1',
        status: DropStatus.OUT_FOR_DELIVERY,
        driverId: 'driver-1',
        deliveryDate,
        deliveryTimeMinutes: 780, // 13:00 IST
        orders: [{ order: { id: 'ord-1' } }],
      };
      prisma.drop.findUnique.mockResolvedValueOnce(drop).mockResolvedValueOnce({
        ...drop,
        status: DropStatus.DELIVERED,
        deliveredAt: new Date('2026-10-03T07:20:00.000Z'),
        isOnTime: true,
        deliveryRecord: {
          id: 'rec-1',
          deliveredAt: new Date('2026-10-03T07:20:00.000Z'),
          note: 'Left with security guard',
          photoUrl: 'https://example.com/photo.jpg',
        },
      });
      prisma.drop.update.mockResolvedValue({
        ...drop,
        status: DropStatus.DELIVERED,
      });

      const caller = mockUser('driver-1', 'DRIVER', ['driver.mark_delivered']);

      const now = new Date('2026-10-03T07:20:00.000Z'); // 12:50 IST (< 13:00)

      const result = await service.markDelivered(
        'drop-1',
        {
          note: 'Left with security guard',
          photoUrl: 'https://example.com/photo.jpg',
        },
        caller,
        now,
      );

      expect(result.status).toBe(DropStatus.DELIVERED);
      expect(prisma.deliveryRecord.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            note: 'Left with security guard',
            photoUrl: 'https://example.com/photo.jpg',
          }),
        }),
      );
      expect(prisma.order.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: OrderStatus.DELIVERED,
          }),
        }),
      );
    });

    it('rejects delivery if caller is not the assigned driver', async () => {
      const drop = {
        id: 'drop-1',
        status: DropStatus.OUT_FOR_DELIVERY,
        driverId: 'driver-1',
        orders: [{ order: { id: 'ord-1' } }],
      };
      prisma.drop.findUnique.mockResolvedValue(drop);

      const wrongDriver = mockUser('driver-2', 'DRIVER', [
        'driver.mark_delivered',
      ]);

      await expect(
        service.markDelivered('drop-1', {}, wrongDriver),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects delivery if drop is not in OUT_FOR_DELIVERY state', async () => {
      const drop = {
        id: 'drop-1',
        status: DropStatus.DISPATCH_READY,
        driverId: 'driver-1',
        orders: [{ order: { id: 'ord-1' } }],
      };
      prisma.drop.findUnique.mockResolvedValue(drop);

      const caller = mockUser('driver-1', 'DRIVER', ['driver.mark_delivered']);

      await expect(service.markDelivered('drop-1', {}, caller)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects repeated delivery with 409 Conflict', async () => {
      const drop = {
        id: 'drop-1',
        status: DropStatus.DELIVERED,
        driverId: 'driver-1',
        orders: [{ order: { id: 'ord-1' } }],
      };
      prisma.drop.findUnique.mockResolvedValue(drop);

      const caller = mockUser('driver-1', 'DRIVER', ['driver.mark_delivered']);

      await expect(service.markDelivered('drop-1', {}, caller)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  // ===========================================================================
  // GROUP F: Order Detail Changes & Drop Reconciliation
  // ===========================================================================
  describe('Group F: Drop Reconcile on Order Changes', () => {
    it('unlinks order from old drop and groups into new drop when delivery time changes', async () => {
      const deliveryDate = parseKolkataCalendarDate('2026-10-03');
      const order = {
        id: 'ord-1',
        companyId: 'comp-1',
        deliveryDate,
        status: OrderStatus.CONFIRMED,
        company: { id: 'comp-1', defaultDriverId: null },
        delivery: {
          deliveryTimeMinutes: 840, // Changed to 14:00
          companyAddressId: 'addr-1',
          addressLine1Snapshot: 'Line 1',
          citySnapshot: 'Bangalore',
          stateSnapshot: 'KA',
          postalCodeSnapshot: '560100',
        },
        dropOrder: {
          dropId: 'old-drop',
          drop: {
            id: 'old-drop',
            companyId: 'comp-1',
            deliveryDate,
            deliveryTimeMinutes: 780, // Was 13:00
            addressKey: 'addr-1',
            status: DropStatus.KITCHEN_READY,
          },
        },
        kitchenReadyAt: null,
      };

      prisma.order.findUnique.mockResolvedValue(order);
      prisma.order.findMany.mockResolvedValue([order]);
      prisma.drop.findUnique.mockResolvedValue(null);
      prisma.drop.create.mockResolvedValue({ id: 'new-drop' });
      prisma.dropOrder.delete.mockResolvedValue({});
      prisma.dropOrder.count.mockResolvedValue(0);
      prisma.drop.delete.mockResolvedValue({});
      prisma.dropOrder.upsert.mockResolvedValue({});
      prisma.drop.findMany.mockResolvedValue([]);
      prisma.drop.count.mockResolvedValue(1);

      await service.reconcileOrderDrop('ord-1');

      expect(prisma.dropOrder.delete).toHaveBeenCalledWith({
        where: { orderId: 'ord-1' },
      });
      expect(prisma.drop.delete).toHaveBeenCalledWith({
        where: { id: 'old-drop' },
      });
      expect(prisma.drop.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            deliveryTimeMinutes: 840,
          }),
        }),
      );
    });
  });

  // ===========================================================================
  // GROUP I: On-Time & Timezone Formulas
  // ===========================================================================
  describe('Group I: Deterministic On-Time & Timezone Math', () => {
    it('correctly calculates scheduled delivery UTC timestamp in Asia/Kolkata', () => {
      const date = parseKolkataCalendarDate('2026-10-03');
      const timeMinutes = 780; // 13:00 IST = 07:30 UTC

      const scheduledUtc = calculateScheduledDeliveryUtc(date, timeMinutes);

      expect(scheduledUtc.toISOString()).toBe('2026-10-03T07:30:00.000Z');
    });

    it('evaluates delivery as ON_TIME when deliveredAt <= scheduledDeliveryUtc', () => {
      const date = parseKolkataCalendarDate('2026-10-03');
      const timeMinutes = 780; // 07:30 UTC
      const scheduledUtc = calculateScheduledDeliveryUtc(date, timeMinutes);

      const deliveredEarly = new Date('2026-10-03T07:25:00.000Z');
      const deliveredExact = new Date('2026-10-03T07:30:00.000Z');

      expect(deliveredEarly.getTime() <= scheduledUtc.getTime()).toBe(true);
      expect(deliveredExact.getTime() <= scheduledUtc.getTime()).toBe(true);
    });

    it('evaluates delivery as LATE when deliveredAt > scheduledDeliveryUtc', () => {
      const date = parseKolkataCalendarDate('2026-10-03');
      const timeMinutes = 780; // 07:30 UTC
      const scheduledUtc = calculateScheduledDeliveryUtc(date, timeMinutes);

      const deliveredLate = new Date('2026-10-03T07:31:00.000Z');

      expect(deliveredLate.getTime() <= scheduledUtc.getTime()).toBe(false);
    });

    it('formats minutes into HH:MM correctly', () => {
      expect(formatMinutesToTime(750)).toBe('12:30');
      expect(formatMinutesToTime(780)).toBe('13:00');
      expect(formatMinutesToTime(810)).toBe('13:30');
    });
  });
});
