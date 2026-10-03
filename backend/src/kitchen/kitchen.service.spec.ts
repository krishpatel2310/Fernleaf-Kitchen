import { Test, TestingModule } from '@nestjs/testing';
import {
  KitchenService,
  calculatePlannedTimings,
  getTimingStatus,
  formatMinutesToTime,
  parseKolkataCalendarDate,
} from './kitchen.service';
import { PrismaService } from '../prisma/prisma.service';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { KitchenUnitStatus, OrderStatus, OrderEventType } from '@prisma/client';

describe('KitchenService - Comprehensive Operations & Invariants (Phase 7)', () => {
  let service: KitchenService;
  let prismaMock: any;

  beforeEach(async () => {
    prismaMock = {
      kitchenUnit: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        count: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        upsert: jest.fn(),
      },
      kitchenStation: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
      },
      order: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      orderCombination: {
        findMany: jest.fn(),
        upsert: jest.fn(),
      },
      orderEvent: {
        create: jest.fn(),
      },
      $transaction: jest.fn(async (cb: (tx: any) => Promise<any>) =>
        cb(prismaMock),
      ),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        KitchenService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    service = module.get<KitchenService>(KitchenService);
  });

  describe('F. Timing Calculations & Timezone Invariants', () => {
    it('calculates planned dispatch-ready and kitchen-ready times accurately', () => {
      // Example from prompt:
      // Delivery date: 2026-10-03, time: 13:00 (780 min), company lead: 60 min
      // planned dispatch-ready: 12:00 (720 min)
      // planned kitchen-ready: 11:30 (690 min)
      const deliveryDate = parseKolkataCalendarDate('2026-10-03');
      const timings = calculatePlannedTimings(deliveryDate, 780, 60);

      // Verify dispatch is exactly 60 minutes before delivery
      // and kitchen-ready is exactly 30 minutes before dispatch
      const diffDispatchToKitchen =
        (timings.plannedDispatchReadyAt.getTime() -
          timings.plannedKitchenReadyAt.getTime()) /
        (60 * 1000);
      expect(diffDispatchToKitchen).toBe(30);

      // Verify Kolkata time offsets:
      // 13:00 in Kolkata is 07:30 UTC
      // 12:00 in Kolkata is 06:30 UTC
      // 11:30 in Kolkata is 06:00 UTC
      expect(timings.plannedDispatchReadyAt.toISOString()).toBe(
        '2026-10-03T06:30:00.000Z',
      );
      expect(timings.plannedKitchenReadyAt.toISOString()).toBe(
        '2026-10-03T06:00:00.000Z',
      );
    });

    it('respects custom company-specific delivery lead times', () => {
      const deliveryDate = parseKolkataCalendarDate('2026-10-03');
      const timings = calculatePlannedTimings(deliveryDate, 780, 45); // 45 min lead

      // Dispatch should be 45 min before 13:00 -> 12:15 (06:45 UTC)
      // Kitchen-ready should be 30 min before dispatch -> 11:45 (06:15 UTC)
      expect(timings.plannedDispatchReadyAt.toISOString()).toBe(
        '2026-10-03T06:45:00.000Z',
      );
      expect(timings.plannedKitchenReadyAt.toISOString()).toBe(
        '2026-10-03T06:15:00.000Z',
      );
    });

    it('formats minutes to time strings correctly', () => {
      expect(formatMinutesToTime(780)).toBe('13:00');
      expect(formatMinutesToTime(750)).toBe('12:30');
      expect(formatMinutesToTime(0)).toBe('00:00');
      expect(formatMinutesToTime(1439)).toBe('23:59');
    });

    it('validates calendar date format strictly', () => {
      expect(() => parseKolkataCalendarDate('invalid-date')).toThrow(
        BadRequestException,
      );
      const valid = parseKolkataCalendarDate('2026-10-03');
      expect(valid.getUTCFullYear()).toBe(2026);
      expect(valid.getUTCMonth()).toBe(9); // 0-indexed October
      expect(valid.getUTCDate()).toBe(3);
    });
  });

  describe('G. Deterministic Late / At-Risk Calculations', () => {
    const plannedKitchenReadyAt = new Date('2026-10-03T06:00:00.000Z'); // 11:30 Kolkata

    it('marks DONE unit as COMPLETED with 0 delay', () => {
      const result = getTimingStatus(
        KitchenUnitStatus.DONE,
        new Date('2026-10-03T06:30:00.000Z'),
        plannedKitchenReadyAt,
        new Date('2026-10-03T07:00:00.000Z'),
      );
      expect(result.timingStatus).toBe('COMPLETED');
      expect(result.delayMinutes).toBe(0);
    });

    it('marks non-done unit as ON_TRACK when more than 15 minutes before deadline', () => {
      // 11:00 Kolkata (05:30 UTC), 30 minutes before deadline
      const now = new Date('2026-10-03T05:30:00.000Z');
      const result = getTimingStatus(
        KitchenUnitStatus.IN_PROGRESS,
        null,
        plannedKitchenReadyAt,
        now,
      );
      expect(result.timingStatus).toBe('ON_TRACK');
      expect(result.delayMinutes).toBe(0);
    });

    it('marks non-done unit as AT_RISK when within 15 minutes before deadline', () => {
      // 11:20 Kolkata (05:50 UTC), 10 minutes before deadline
      const now = new Date('2026-10-03T05:50:00.000Z');
      const result = getTimingStatus(
        KitchenUnitStatus.NOT_STARTED,
        null,
        plannedKitchenReadyAt,
        now,
      );
      expect(result.timingStatus).toBe('AT_RISK');
      expect(result.delayMinutes).toBe(0);
    });

    it('marks non-done unit as LATE with exact delay when deadline has passed', () => {
      // 11:45 Kolkata (06:15 UTC), 15 minutes past deadline
      const now = new Date('2026-10-03T06:15:00.000Z');
      const result = getTimingStatus(
        KitchenUnitStatus.IN_PROGRESS,
        null,
        plannedKitchenReadyAt,
        now,
      );
      expect(result.timingStatus).toBe('LATE');
      expect(result.delayMinutes).toBe(15);
    });

    it('does NOT mark future delivery dates as late', () => {
      // Delivery tomorrow: planned is tomorrow at 11:30
      const tomorrowPlanned = new Date('2026-10-04T06:00:00.000Z');
      const now = new Date('2026-10-03T06:00:00.000Z');
      const result = getTimingStatus(
        KitchenUnitStatus.NOT_STARTED,
        null,
        tomorrowPlanned,
        now,
      );
      expect(result.timingStatus).toBe('ON_TRACK');
      expect(result.delayMinutes).toBe(0);
    });
  });

  describe('A. Kitchen Board Query & Server-Side Filtering', () => {
    it('retrieves confirmed orders with server-side date and status filtering', async () => {
      prismaMock.orderCombination.findMany.mockResolvedValue([]);
      prismaMock.kitchenUnit.findMany.mockResolvedValue([
        {
          id: 'unit-1',
          orderId: 'order-1',
          stationId: 'st-cold',
          status: KitchenUnitStatus.NOT_STARTED,
          startedAt: null,
          completedAt: null,
          station: { id: 'st-cold', name: 'Cold Prep' },
          orderCombination: {
            id: 'combo-1',
            quantity: 2,
            unitPriceCents: 750,
            combinationTotalCents: 1500,
            orderLine: {
              id: 'line-1',
              dishId: 'dish-1',
              dishNameSnapshot: 'Chicken Salad',
              dishSkuSnapshot: 'SKU-SALAD',
              dishUnitPriceCents: 750,
              quantity: 2,
            },
            options: [],
          },
          order: {
            id: 'order-1',
            orderNumber: 'FK-2026-0001',
            deliveryDate: new Date('2026-10-03T00:00:00.000Z'),
            deliveryTimeMinutes: 780,
            kitchenStartedAt: null,
            kitchenReadyAt: null,
            plannedKitchenReadyAt: new Date('2026-10-03T06:00:00.000Z'),
            plannedDispatchReadyAt: new Date('2026-10-03T06:30:00.000Z'),
            company: {
              id: 'comp-1',
              name: 'Apex Ltd',
              deliveryMinutesBefore: 60,
            },
          },
        },
      ]);

      const result = await service.getBoard('2026-10-03');

      expect(prismaMock.kitchenUnit.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            order: {
              deliveryDate: expect.any(Date),
              status: OrderStatus.CONFIRMED,
            },
          }),
        }),
      );

      expect(result.date).toBe('2026-10-03');
      expect(result.summary.totalUnits).toBe(1);
      expect(result.units[0].dish.name).toBe('Chicken Salad');
      expect(result.units[0].station.name).toBe('Cold Prep');
    });

    it('filters by unassigned station correctly', async () => {
      prismaMock.orderCombination.findMany.mockResolvedValue([]);
      prismaMock.kitchenUnit.findMany.mockResolvedValue([]);

      await service.getBoard('2026-10-03', 'unassigned');

      expect(prismaMock.kitchenUnit.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            stationId: null,
          }),
        }),
      );
    });
  });

  describe('B. Kitchen Unit Creation & Invariant Enforcement', () => {
    it('creates exactly one KitchenUnit per distinct OrderCombination idempotently', async () => {
      prismaMock.order.findUnique.mockResolvedValue({
        id: 'ord-1',
        status: OrderStatus.CONFIRMED,
        lines: [
          {
            dish: { kitchenStationId: 'st-hot' },
            combinations: [
              { id: 'combo-a', kitchenUnit: null },
              { id: 'combo-b', kitchenUnit: null },
            ],
          },
        ],
      });

      await service.ensureKitchenUnitsForOrder('ord-1');

      expect(prismaMock.kitchenUnit.upsert).toHaveBeenCalledTimes(2);
      expect(prismaMock.kitchenUnit.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { orderCombinationId: 'combo-a' },
          create: expect.objectContaining({
            orderId: 'ord-1',
            orderCombinationId: 'combo-a',
            stationId: 'st-hot',
            status: KitchenUnitStatus.NOT_STARTED,
          }),
        }),
      );
    });

    it('does not create kitchen units for non-confirmed orders', async () => {
      prismaMock.order.findUnique.mockResolvedValue({
        id: 'ord-draft',
        status: OrderStatus.DRAFT,
        lines: [],
      });

      await service.ensureKitchenUnitsForOrder('ord-draft');
      expect(prismaMock.kitchenUnit.upsert).not.toHaveBeenCalled();
    });
  });

  describe('C. Start Unit Lifecycle & Concurrency Invariants', () => {
    it('transitions NOT_STARTED to IN_PROGRESS, sets startedAt and order.kitchenStartedAt', async () => {
      const now = new Date('2026-10-03T05:00:00.000Z');
      prismaMock.kitchenUnit.findUnique
        .mockResolvedValueOnce({
          id: 'unit-1',
          orderId: 'ord-1',
          status: KitchenUnitStatus.NOT_STARTED,
          order: {
            id: 'ord-1',
            orderNumber: 'FK-1',
            status: OrderStatus.CONFIRMED,
          },
        })
        .mockResolvedValueOnce({
          id: 'unit-1',
          status: KitchenUnitStatus.IN_PROGRESS,
          startedAt: now,
          order: { id: 'ord-1', kitchenStartedAt: now },
        });

      prismaMock.kitchenUnit.updateMany.mockResolvedValue({ count: 1 });
      prismaMock.order.updateMany.mockResolvedValue({ count: 1 });

      const res = await service.startUnit('unit-1', 'user-1', now);

      expect(prismaMock.kitchenUnit.updateMany).toHaveBeenCalledWith({
        where: { id: 'unit-1', status: KitchenUnitStatus.NOT_STARTED },
        data: { status: KitchenUnitStatus.IN_PROGRESS, startedAt: now },
      });

      expect(prismaMock.order.updateMany).toHaveBeenCalledWith({
        where: { id: 'ord-1', kitchenStartedAt: null },
        data: { kitchenStartedAt: now },
      });

      expect(prismaMock.orderEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          orderId: 'ord-1',
          type: OrderEventType.KITCHEN_STARTED,
        }),
      });

      expect(res.status).toBe(KitchenUnitStatus.IN_PROGRESS);
    });

    it('rejects starting a unit for non-confirmed orders', async () => {
      prismaMock.kitchenUnit.findUnique.mockResolvedValue({
        id: 'unit-1',
        status: KitchenUnitStatus.NOT_STARTED,
        order: { id: 'ord-1', orderNumber: 'FK-1', status: OrderStatus.PLACED },
      });

      await expect(service.startUnit('unit-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects starting an already started or finished unit with ConflictException', async () => {
      prismaMock.kitchenUnit.findUnique.mockResolvedValue({
        id: 'unit-1',
        status: KitchenUnitStatus.IN_PROGRESS,
        order: {
          id: 'ord-1',
          orderNumber: 'FK-1',
          status: OrderStatus.CONFIRMED,
        },
      });

      await expect(service.startUnit('unit-1')).rejects.toThrow(
        ConflictException,
      );
    });

    it('prevents concurrent double start through atomic update conditional guard', async () => {
      prismaMock.kitchenUnit.findUnique.mockResolvedValue({
        id: 'unit-1',
        status: KitchenUnitStatus.NOT_STARTED,
        order: {
          id: 'ord-1',
          orderNumber: 'FK-1',
          status: OrderStatus.CONFIRMED,
        },
      });
      // Simulate atomic race condition where another request updated it first
      prismaMock.kitchenUnit.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.startUnit('unit-1')).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('D. Finish Unit Lifecycle & Finish-Without-Start Rule', () => {
    it('transitions IN_PROGRESS to DONE and sets completedAt', async () => {
      const startedAt = new Date('2026-10-03T05:00:00.000Z');
      const completedAt = new Date('2026-10-03T05:30:00.000Z');

      prismaMock.kitchenUnit.findUnique
        .mockResolvedValueOnce({
          id: 'unit-1',
          orderId: 'ord-1',
          status: KitchenUnitStatus.IN_PROGRESS,
          startedAt,
          order: {
            id: 'ord-1',
            orderNumber: 'FK-1',
            status: OrderStatus.CONFIRMED,
          },
        })
        .mockResolvedValueOnce({
          id: 'unit-1',
          status: KitchenUnitStatus.DONE,
          startedAt,
          completedAt,
          order: {
            id: 'ord-1',
            kitchenStartedAt: startedAt,
            kitchenReadyAt: null,
          },
        });

      prismaMock.kitchenUnit.updateMany.mockResolvedValue({ count: 1 });
      prismaMock.order.updateMany.mockResolvedValue({ count: 0 });
      prismaMock.kitchenUnit.count.mockResolvedValue(1); // 1 other unit still incomplete

      const res = await service.finishUnit('unit-1', 'user-1', completedAt);

      expect(prismaMock.kitchenUnit.updateMany).toHaveBeenCalledWith({
        where: { id: 'unit-1', status: KitchenUnitStatus.IN_PROGRESS },
        data: { status: KitchenUnitStatus.DONE, startedAt, completedAt },
      });

      expect(res.status).toBe(KitchenUnitStatus.DONE);
    });

    it('FINISH-WITHOUT-START: finishes NOT_STARTED unit and records both start and finish timestamps', async () => {
      const now = new Date('2026-10-03T05:40:00.000Z');

      prismaMock.kitchenUnit.findUnique
        .mockResolvedValueOnce({
          id: 'unit-2',
          orderId: 'ord-1',
          status: KitchenUnitStatus.NOT_STARTED,
          startedAt: null,
          order: {
            id: 'ord-1',
            orderNumber: 'FK-1',
            status: OrderStatus.CONFIRMED,
          },
        })
        .mockResolvedValueOnce({
          id: 'unit-2',
          status: KitchenUnitStatus.DONE,
          startedAt: now,
          completedAt: now,
          order: { id: 'ord-1', kitchenStartedAt: now, kitchenReadyAt: null },
        });

      prismaMock.kitchenUnit.updateMany.mockResolvedValue({ count: 1 });
      prismaMock.order.updateMany.mockResolvedValue({ count: 1 }); // sets kitchenStartedAt on order
      prismaMock.kitchenUnit.count.mockResolvedValue(2); // still others incomplete

      const res = await service.finishUnit('unit-2', 'user-1', now);

      expect(prismaMock.kitchenUnit.updateMany).toHaveBeenCalledWith({
        where: { id: 'unit-2', status: KitchenUnitStatus.NOT_STARTED },
        data: {
          status: KitchenUnitStatus.DONE,
          startedAt: now,
          completedAt: now,
        },
      });

      expect(res.startedAt).toEqual(now);
      expect(res.completedAt).toEqual(now);
    });

    it('rejects duplicate finish on already DONE unit', async () => {
      prismaMock.kitchenUnit.findUnique.mockResolvedValue({
        id: 'unit-1',
        status: KitchenUnitStatus.DONE,
        order: {
          id: 'ord-1',
          orderNumber: 'FK-1',
          status: OrderStatus.CONFIRMED,
        },
      });

      await expect(service.finishUnit('unit-1')).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('E. Order Kitchen Readiness Invariants', () => {
    it('sets order.kitchenReadyAt ONLY when all units for the confirmed order are DONE', async () => {
      const now = new Date('2026-10-03T05:55:00.000Z');

      prismaMock.kitchenUnit.findUnique
        .mockResolvedValueOnce({
          id: 'unit-final',
          orderId: 'ord-1',
          status: KitchenUnitStatus.IN_PROGRESS,
          startedAt: new Date('2026-10-03T05:10:00.000Z'),
          order: {
            id: 'ord-1',
            orderNumber: 'FK-1',
            status: OrderStatus.CONFIRMED,
          },
        })
        .mockResolvedValueOnce({
          id: 'unit-final',
          status: KitchenUnitStatus.DONE,
          order: { id: 'ord-1', kitchenReadyAt: now },
        });

      prismaMock.kitchenUnit.updateMany.mockResolvedValue({ count: 1 });
      prismaMock.order.updateMany.mockResolvedValue({ count: 1 });
      prismaMock.kitchenUnit.count.mockResolvedValue(0); // 0 remaining incomplete units!

      await service.finishUnit('unit-final', 'user-1', now);

      // Order readiness was triggered
      expect(prismaMock.order.updateMany).toHaveBeenCalledWith({
        where: { id: 'ord-1', kitchenReadyAt: null },
        data: { kitchenReadyAt: now },
      });

      expect(prismaMock.orderEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          orderId: 'ord-1',
          type: OrderEventType.KITCHEN_READY,
        }),
      });
    });

    it('does NOT set kitchenReadyAt if partial units remain unfinished', async () => {
      const now = new Date('2026-10-03T05:30:00.000Z');

      prismaMock.kitchenUnit.findUnique
        .mockResolvedValueOnce({
          id: 'unit-1',
          orderId: 'ord-1',
          status: KitchenUnitStatus.IN_PROGRESS,
          startedAt: now,
          order: {
            id: 'ord-1',
            orderNumber: 'FK-1',
            status: OrderStatus.CONFIRMED,
          },
        })
        .mockResolvedValueOnce({
          id: 'unit-1',
          status: KitchenUnitStatus.DONE,
        });

      prismaMock.kitchenUnit.updateMany.mockResolvedValue({ count: 1 });
      prismaMock.kitchenUnit.count.mockResolvedValue(2); // 2 units remain incomplete

      await service.finishUnit('unit-1', 'user-1', now);

      // order.updateMany for kitchenReadyAt should NOT be called
      expect(prismaMock.order.updateMany).not.toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'ord-1', kitchenReadyAt: null },
        }),
      );
    });
  });

  describe('H. Admin Force-Complete & Idempotency', () => {
    it('completes all incomplete units and marks order ready with operational events', async () => {
      const now = new Date('2026-10-03T06:00:00.000Z');

      prismaMock.order.findUnique
        .mockResolvedValueOnce({
          id: 'ord-force',
          orderNumber: 'FK-FORCE',
          status: OrderStatus.CONFIRMED,
          kitchenStartedAt: null,
          kitchenReadyAt: null,
        })
        .mockResolvedValueOnce({
          id: 'ord-force',
          orderNumber: 'FK-FORCE',
          status: OrderStatus.CONFIRMED,
          lines: [],
        })
        .mockResolvedValueOnce({
          id: 'ord-force',
          orderNumber: 'FK-FORCE',
          kitchenReadyAt: now,
        });

      prismaMock.kitchenUnit.findMany.mockResolvedValue([
        {
          id: 'u1',
          status: KitchenUnitStatus.IN_PROGRESS,
          startedAt: new Date('2026-10-03T05:00:00Z'),
        },
        { id: 'u2', status: KitchenUnitStatus.NOT_STARTED, startedAt: null },
        {
          id: 'u3',
          status: KitchenUnitStatus.DONE,
          startedAt: new Date('2026-10-03T04:00:00Z'),
          completedAt: new Date('2026-10-03T04:30:00Z'),
        },
      ]);

      await service.forceCompleteOrder('ord-force', 'admin-user', now);

      // u1 retains its start time
      expect(prismaMock.kitchenUnit.update).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: {
          status: KitchenUnitStatus.DONE,
          startedAt: new Date('2026-10-03T05:00:00Z'),
          completedAt: now,
        },
      });

      // u2 follows finish-without-start rule: sets startedAt = now
      expect(prismaMock.kitchenUnit.update).toHaveBeenCalledWith({
        where: { id: 'u2' },
        data: {
          status: KitchenUnitStatus.DONE,
          startedAt: now,
          completedAt: now,
        },
      });

      // u3 was already DONE: not updated
      expect(prismaMock.kitchenUnit.update).not.toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'u3' } }),
      );

      // Order updated to ready
      expect(prismaMock.order.update).toHaveBeenCalledWith({
        where: { id: 'ord-force' },
        data: {
          kitchenStartedAt: now,
          kitchenReadyAt: now,
        },
      });

      expect(prismaMock.orderEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          type: OrderEventType.ADMIN_OVERRIDE,
          orderId: 'ord-force',
        }),
      });

      expect(prismaMock.orderEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          type: OrderEventType.KITCHEN_READY,
          orderId: 'ord-force',
        }),
      });
    });

    it('is completely idempotent when called multiple times on already ready order', async () => {
      const alreadyReadyDate = new Date('2026-10-03T05:30:00.000Z');

      prismaMock.order.findUnique
        .mockResolvedValueOnce({
          id: 'ord-already-ready',
          orderNumber: 'FK-READY',
          status: OrderStatus.CONFIRMED,
          kitchenReadyAt: alreadyReadyDate,
        })
        .mockResolvedValueOnce({
          id: 'ord-already-ready',
          status: OrderStatus.CONFIRMED,
          lines: [],
        })
        .mockResolvedValueOnce({
          id: 'ord-already-ready',
          kitchenReadyAt: alreadyReadyDate,
        });

      prismaMock.kitchenUnit.findMany.mockResolvedValue([
        {
          id: 'u1',
          status: KitchenUnitStatus.DONE,
          completedAt: alreadyReadyDate,
        },
      ]);

      await service.forceCompleteOrder('ord-already-ready', 'admin-user');

      // No units updated, no order updated, no duplicate events
      expect(prismaMock.kitchenUnit.update).not.toHaveBeenCalled();
      expect(prismaMock.order.update).not.toHaveBeenCalled();
      expect(prismaMock.orderEvent.create).not.toHaveBeenCalled();
    });
  });
});
