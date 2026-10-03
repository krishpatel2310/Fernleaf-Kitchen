import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  KitchenUnitStatus,
  OrderStatus,
  OrderEventType,
  Prisma,
} from '@prisma/client';

export type KitchenTimingStatus = 'ON_TRACK' | 'AT_RISK' | 'LATE' | 'COMPLETED';

/**
 * Calculates planned timings using the assignment formula:
 * - planned dispatch-ready: delivery time - company.deliveryMinutesBefore
 * - planned kitchen-ready: planned dispatch-ready - 30 minutes
 */
export function calculatePlannedTimings(
  deliveryDate: Date,
  deliveryTimeMinutes: number,
  deliveryMinutesBefore: number = 60,
): { plannedDispatchReadyAt: Date; plannedKitchenReadyAt: Date } {
  const kolkataOffsetMs = 330 * 60 * 1000;
  // calendarDate is midnight UTC representing the calendar day.
  // Midnight in Kolkata occurs 330 minutes earlier in UTC.
  const midnightUtcMs = deliveryDate.getTime() - kolkataOffsetMs;
  const deliveryUtcMs = midnightUtcMs + deliveryTimeMinutes * 60 * 1000;

  const plannedDispatchReadyAt = new Date(
    deliveryUtcMs - deliveryMinutesBefore * 60 * 1000,
  );
  const plannedKitchenReadyAt = new Date(
    plannedDispatchReadyAt.getTime() - 30 * 60 * 1000,
  );

  return { plannedDispatchReadyAt, plannedKitchenReadyAt };
}

/**
 * Formats minute-of-day (e.g. 780) into "HH:mm" (e.g. "13:00").
 */
export function formatMinutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60)
    .toString()
    .padStart(2, '0');
  const m = (minutes % 60).toString().padStart(2, '0');
  return `${h}:${m}`;
}

/**
 * Normalizes input date string into UTC midnight calendar date.
 */
export function parseKolkataCalendarDate(dateInput: Date | string): Date {
  if (typeof dateInput === 'string') {
    const parts = dateInput.split('T')[0].split('-').map(Number);
    if (
      parts.length !== 3 ||
      isNaN(parts[0]) ||
      isNaN(parts[1]) ||
      isNaN(parts[2])
    ) {
      throw new BadRequestException(
        `Invalid date format: '${dateInput}'. Expected YYYY-MM-DD.`,
      );
    }
    return new Date(Date.UTC(parts[0], parts[1] - 1, parts[2], 0, 0, 0, 0));
  }

  if (isNaN(dateInput.getTime())) {
    throw new BadRequestException('Invalid date provided');
  }

  return new Date(
    Date.UTC(
      dateInput.getUTCFullYear(),
      dateInput.getUTCMonth(),
      dateInput.getUTCDate(),
      0,
      0,
      0,
      0,
    ),
  );
}

/**
 * Returns current YYYY-MM-DD string in Asia/Kolkata timezone.
 */
export function getKolkataDateString(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/**
 * Deterministically evaluates late/at-risk timing status against planned kitchen-ready time.
 */
export function getTimingStatus(
  status: KitchenUnitStatus,
  completedAt: Date | null,
  plannedKitchenReadyAt: Date,
  now: Date = new Date(),
): { timingStatus: KitchenTimingStatus; delayMinutes: number } {
  if (status === KitchenUnitStatus.DONE || completedAt) {
    return {
      timingStatus: 'COMPLETED',
      delayMinutes: 0,
    };
  }

  const plannedMs = plannedKitchenReadyAt.getTime();
  const nowMs = now.getTime();

  if (nowMs > plannedMs) {
    const delayMinutes = Math.floor((nowMs - plannedMs) / (60 * 1000));
    return {
      timingStatus: 'LATE',
      delayMinutes,
    };
  }

  // Within 15 minutes of the planned deadline
  const atRiskThresholdMs = plannedMs - 15 * 60 * 1000;
  if (nowMs >= atRiskThresholdMs) {
    return {
      timingStatus: 'AT_RISK',
      delayMinutes: 0,
    };
  }

  return {
    timingStatus: 'ON_TRACK',
    delayMinutes: 0,
  };
}

@Injectable()
export class KitchenService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Returns active kitchen stations for board filtering.
   */
  async getStations() {
    return this.prisma.kitchenStation.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        isActive: true,
      },
    });
  }

  /**
   * Ensures that every OrderCombination for a confirmed order has a corresponding KitchenUnit.
   * Idempotent: uses upsert with empty update so existing units and timestamps are preserved.
   */
  async ensureKitchenUnitsForOrder(
    orderId: string,
    client?: Prisma.TransactionClient,
  ): Promise<void> {
    const db = client || this.prisma;
    const order = await db.order.findUnique({
      where: { id: orderId },
      include: {
        lines: {
          include: {
            dish: true,
            combinations: {
              include: {
                kitchenUnit: true,
              },
            },
          },
        },
      },
    });

    if (!order || order.status !== OrderStatus.CONFIRMED) {
      return;
    }

    for (const line of order.lines) {
      const stationId = line.dish?.kitchenStationId ?? null;
      for (const combo of line.combinations) {
        if (!combo.kitchenUnit) {
          await db.kitchenUnit.upsert({
            where: { orderCombinationId: combo.id },
            create: {
              orderId: order.id,
              orderCombinationId: combo.id,
              stationId,
              status: KitchenUnitStatus.NOT_STARTED,
            },
            update: {}, // preserve existing unit state
          });
        }
      }
    }
  }

  /**
   * Ensures all confirmed orders for a delivery date have kitchen units provisioned.
   * Single-batch check to prevent N+1 queries.
   */
  async ensureKitchenUnitsForDate(
    deliveryDate: Date,
    client?: Prisma.TransactionClient,
  ): Promise<void> {
    const db = client || this.prisma;
    const missingUnitsCombos = await db.orderCombination.findMany({
      where: {
        orderLine: {
          order: {
            deliveryDate,
            status: OrderStatus.CONFIRMED,
          },
        },
        kitchenUnit: null,
      },
      include: {
        orderLine: {
          include: {
            dish: true,
            order: true,
          },
        },
      },
    });

    if (missingUnitsCombos.length > 0) {
      for (const combo of missingUnitsCombos) {
        await db.kitchenUnit.upsert({
          where: { orderCombinationId: combo.id },
          create: {
            orderId: combo.orderLine.order.id,
            orderCombinationId: combo.id,
            stationId: combo.orderLine.dish?.kitchenStationId ?? null,
            status: KitchenUnitStatus.NOT_STARTED,
          },
          update: {},
        });
      }
    }
  }

  /**
   * Kitchen board endpoint:
   * Returns all active confirmed kitchen units for a given delivery date.
   * Server-side date filtering, station filtering, late/at-risk calculation.
   */
  async getBoard(dateStr?: string, stationId?: string, now: Date = new Date()) {
    const targetDateStr = dateStr || getKolkataDateString(now);
    const targetDate = parseKolkataCalendarDate(targetDateStr);

    // 1. Ensure all confirmed orders for this date have kitchen units
    await this.ensureKitchenUnitsForDate(targetDate);

    // 2. Build where filter: only confirmed orders for this delivery date
    const where: Prisma.KitchenUnitWhereInput = {
      order: {
        deliveryDate: targetDate,
        status: OrderStatus.CONFIRMED,
      },
    };

    if (stationId) {
      where.stationId = stationId === 'unassigned' ? null : stationId;
    }

    // 3. Query kitchen units with all relevant operational information
    const units = await this.prisma.kitchenUnit.findMany({
      where,
      include: {
        station: { select: { id: true, name: true } },
        orderCombination: {
          select: {
            id: true,
            quantity: true,
            unitPriceCents: true,
            combinationTotalCents: true,
            orderLine: {
              select: {
                id: true,
                dishId: true,
                dishNameSnapshot: true,
                dishSkuSnapshot: true,
                dishUnitPriceCents: true,
                quantity: true,
              },
            },
            options: {
              select: {
                id: true,
                optionGroupNameSnapshot: true,
                optionNameSnapshot: true,
                portionNameSnapshot: true,
                portionExtraCents: true,
              },
            },
          },
        },
        order: {
          select: {
            id: true,
            orderNumber: true,
            deliveryDate: true,
            deliveryTimeMinutes: true,
            kitchenStartedAt: true,
            kitchenReadyAt: true,
            plannedKitchenReadyAt: true,
            plannedDispatchReadyAt: true,
            company: {
              select: {
                id: true,
                name: true,
                deliveryMinutesBefore: true,
              },
            },
          },
        },
      },
      orderBy: [
        { order: { deliveryTimeMinutes: 'asc' } },
        { createdAt: 'asc' },
      ],
    });

    // 4. Transform into clean operational view with timing status
    const orderSet = new Set<string>();
    let notStartedCount = 0;
    let inProgressCount = 0;
    let doneCount = 0;
    let lateCount = 0;
    let atRiskCount = 0;
    let onTrackCount = 0;
    let completedCount = 0;

    const formattedUnits = units.map((u) => {
      orderSet.add(u.order.id);

      // Resolve planned timings (fallback to calculation if missing)
      const plannedTimings =
        u.order.plannedDispatchReadyAt && u.order.plannedKitchenReadyAt
          ? {
              plannedDispatchReadyAt: u.order.plannedDispatchReadyAt,
              plannedKitchenReadyAt: u.order.plannedKitchenReadyAt,
            }
          : calculatePlannedTimings(
              u.order.deliveryDate,
              u.order.deliveryTimeMinutes,
              u.order.company.deliveryMinutesBefore ?? 60,
            );

      const timing = getTimingStatus(
        u.status,
        u.completedAt,
        plannedTimings.plannedKitchenReadyAt,
        now,
      );

      // Track summary counts
      if (u.status === KitchenUnitStatus.NOT_STARTED) notStartedCount++;
      else if (u.status === KitchenUnitStatus.IN_PROGRESS) inProgressCount++;
      else if (u.status === KitchenUnitStatus.DONE) doneCount++;

      if (timing.timingStatus === 'LATE') lateCount++;
      else if (timing.timingStatus === 'AT_RISK') atRiskCount++;
      else if (timing.timingStatus === 'ON_TRACK') onTrackCount++;
      else if (timing.timingStatus === 'COMPLETED') completedCount++;

      return {
        id: u.id,
        orderId: u.orderId,
        orderNumber: u.order.orderNumber,
        company: {
          id: u.order.company.id,
          name: u.order.company.name,
        },
        deliveryDate: targetDateStr,
        deliveryTimeMinutes: u.order.deliveryTimeMinutes,
        deliveryTimeFormatted: formatMinutesToTime(u.order.deliveryTimeMinutes),
        dish: {
          id: u.orderCombination.orderLine.dishId,
          name: u.orderCombination.orderLine.dishNameSnapshot,
          sku: u.orderCombination.orderLine.dishSkuSnapshot,
        },
        combination: {
          id: u.orderCombination.id,
          quantity: u.orderCombination.quantity,
          options: u.orderCombination.options.map((opt) => ({
            groupName: opt.optionGroupNameSnapshot,
            optionName: opt.optionNameSnapshot,
            portionName: opt.portionNameSnapshot,
            extraCents: opt.portionExtraCents,
          })),
        },
        stationId: u.stationId,
        station: u.station ? { id: u.station.id, name: u.station.name } : null,
        status: u.status,
        startedAt: u.startedAt,
        finishedAt: u.completedAt,
        completedAt: u.completedAt,
        plannedDispatchReadyAt: plannedTimings.plannedDispatchReadyAt,
        plannedKitchenReadyAt: plannedTimings.plannedKitchenReadyAt,
        orderKitchenStartedAt: u.order.kitchenStartedAt,
        orderKitchenReadyAt: u.order.kitchenReadyAt,
        timingStatus: timing.timingStatus,
        delayMinutes: timing.delayMinutes,
      };
    });

    return {
      date: targetDateStr,
      summary: {
        totalOrders: orderSet.size,
        totalUnits: units.length,
        notStartedUnits: notStartedCount,
        inProgressUnits: inProgressCount,
        doneUnits: doneCount,
        lateUnits: lateCount,
        atRiskUnits: atRiskCount,
        onTrackUnits: onTrackCount,
        completedUnits: completedCount,
      },
      units: formattedUnits,
    };
  }

  /**
   * Retrieves single kitchen unit details.
   */
  async findOneUnit(id: string, now: Date = new Date()) {
    const unit = await this.prisma.kitchenUnit.findUnique({
      where: { id },
      include: {
        station: { select: { id: true, name: true } },
        orderCombination: {
          select: {
            id: true,
            quantity: true,
            unitPriceCents: true,
            combinationTotalCents: true,
            orderLine: {
              select: {
                id: true,
                dishId: true,
                dishNameSnapshot: true,
                dishSkuSnapshot: true,
                dishUnitPriceCents: true,
                quantity: true,
              },
            },
            options: {
              select: {
                id: true,
                optionGroupNameSnapshot: true,
                optionNameSnapshot: true,
                portionNameSnapshot: true,
                portionExtraCents: true,
              },
            },
          },
        },
        order: {
          select: {
            id: true,
            orderNumber: true,
            deliveryDate: true,
            deliveryTimeMinutes: true,
            status: true,
            kitchenStartedAt: true,
            kitchenReadyAt: true,
            plannedKitchenReadyAt: true,
            plannedDispatchReadyAt: true,
            company: {
              select: {
                id: true,
                name: true,
                deliveryMinutesBefore: true,
              },
            },
          },
        },
      },
    });

    if (!unit) {
      throw new NotFoundException(`Kitchen unit with ID '${id}' not found`);
    }

    const plannedTimings =
      unit.order.plannedDispatchReadyAt && unit.order.plannedKitchenReadyAt
        ? {
            plannedDispatchReadyAt: unit.order.plannedDispatchReadyAt,
            plannedKitchenReadyAt: unit.order.plannedKitchenReadyAt,
          }
        : calculatePlannedTimings(
            unit.order.deliveryDate,
            unit.order.deliveryTimeMinutes,
            unit.order.company.deliveryMinutesBefore ?? 60,
          );

    const timing = getTimingStatus(
      unit.status,
      unit.completedAt,
      plannedTimings.plannedKitchenReadyAt,
      now,
    );

    return {
      id: unit.id,
      orderId: unit.orderId,
      orderNumber: unit.order.orderNumber,
      orderStatus: unit.order.status,
      company: {
        id: unit.order.company.id,
        name: unit.order.company.name,
      },
      deliveryDate: unit.order.deliveryDate.toISOString().split('T')[0],
      deliveryTimeMinutes: unit.order.deliveryTimeMinutes,
      deliveryTimeFormatted: formatMinutesToTime(
        unit.order.deliveryTimeMinutes,
      ),
      dish: {
        id: unit.orderCombination.orderLine.dishId,
        name: unit.orderCombination.orderLine.dishNameSnapshot,
        sku: unit.orderCombination.orderLine.dishSkuSnapshot,
      },
      combination: {
        id: unit.orderCombination.id,
        quantity: unit.orderCombination.quantity,
        options: unit.orderCombination.options.map((opt) => ({
          groupName: opt.optionGroupNameSnapshot,
          optionName: opt.optionNameSnapshot,
          portionName: opt.portionNameSnapshot,
          extraCents: opt.portionExtraCents,
        })),
      },
      stationId: unit.stationId,
      station: unit.station
        ? { id: unit.station.id, name: unit.station.name }
        : null,
      status: unit.status,
      startedAt: unit.startedAt,
      finishedAt: unit.completedAt,
      completedAt: unit.completedAt,
      plannedDispatchReadyAt: plannedTimings.plannedDispatchReadyAt,
      plannedKitchenReadyAt: plannedTimings.plannedKitchenReadyAt,
      orderKitchenStartedAt: unit.order.kitchenStartedAt,
      orderKitchenReadyAt: unit.order.kitchenReadyAt,
      timingStatus: timing.timingStatus,
      delayMinutes: timing.delayMinutes,
    };
  }

  /**
   * Starts a kitchen unit:
   * - Requires order to be CONFIRMED.
   * - Transitions NOT_STARTED -> IN_PROGRESS.
   * - Sets startedAt.
   * - Concurrency-safe atomic update.
   * - Sets Order.kitchenStartedAt if null (never overwrites on subsequent starts).
   */
  async startUnit(id: string, userId?: string, now: Date = new Date()) {
    return this.prisma.$transaction(async (tx) => {
      const unit = await tx.kitchenUnit.findUnique({
        where: { id },
        include: { order: true },
      });

      if (!unit) {
        throw new NotFoundException(`Kitchen unit with ID '${id}' not found`);
      }

      if (unit.order.status !== OrderStatus.CONFIRMED) {
        throw new BadRequestException(
          `Cannot start kitchen unit for order '${unit.order.orderNumber}' in '${unit.order.status}' status. Only CONFIRMED orders are eligible for kitchen production.`,
        );
      }

      if (unit.status !== KitchenUnitStatus.NOT_STARTED) {
        throw new ConflictException(
          `Kitchen unit '${id}' cannot be started because it is already '${unit.status}'`,
        );
      }

      // Atomic conditional update for concurrency safety
      const updateResult = await tx.kitchenUnit.updateMany({
        where: {
          id,
          status: KitchenUnitStatus.NOT_STARTED,
        },
        data: {
          status: KitchenUnitStatus.IN_PROGRESS,
          startedAt: now,
        },
      });

      if (updateResult.count === 0) {
        throw new ConflictException(
          `Concurrent update conflict: Kitchen unit '${id}' has already been started or modified`,
        );
      }

      // Update Order.kitchenStartedAt if currently null (atomic, concurrency-safe)
      const orderUpdate = await tx.order.updateMany({
        where: {
          id: unit.orderId,
          kitchenStartedAt: null,
        },
        data: {
          kitchenStartedAt: now,
        },
      });

      if (orderUpdate?.count > 0) {
        await tx.orderEvent.create({
          data: {
            orderId: unit.orderId,
            userId: userId || null,
            type: OrderEventType.KITCHEN_STARTED,
            note: `Kitchen production started (unit ${unit.id})`,
            occurredAt: now,
          },
        });
      }

      return tx.kitchenUnit.findUnique({
        where: { id },
        include: {
          station: { select: { id: true, name: true } },
          order: {
            select: {
              id: true,
              orderNumber: true,
              status: true,
              kitchenStartedAt: true,
              kitchenReadyAt: true,
            },
          },
        },
      });
    });
  }

  /**
   * Finishes a kitchen unit:
   * - Requires order to be CONFIRMED.
   * - Rejects if already DONE.
   * - Transitions to DONE and sets completedAt.
   * - IMPORTANT ASSIGNMENT RULE: Finish without start is permitted!
   *   If NOT_STARTED, sets both startedAt and completedAt.
   * - Sets Order.kitchenStartedAt if null.
   * - Checks if all units on confirmed order are DONE: if so, sets Order.kitchenReadyAt.
   * - Concurrency-safe atomic updates.
   */
  async finishUnit(id: string, userId?: string, now: Date = new Date()) {
    return this.prisma.$transaction(async (tx) => {
      const unit = await tx.kitchenUnit.findUnique({
        where: { id },
        include: { order: true },
      });

      if (!unit) {
        throw new NotFoundException(`Kitchen unit with ID '${id}' not found`);
      }

      if (unit.order.status !== OrderStatus.CONFIRMED) {
        throw new BadRequestException(
          `Cannot finish kitchen unit for order '${unit.order.orderNumber}' in '${unit.order.status}' status. Only CONFIRMED orders are eligible for kitchen production.`,
        );
      }

      if (unit.status === KitchenUnitStatus.DONE) {
        throw new ConflictException(
          `Kitchen unit '${id}' cannot be finished because it is already DONE`,
        );
      }

      // Finish-without-start rule: if never started, startedAt is recorded as now
      const startedAt = unit.startedAt || now;
      const completedAt = now;

      // Atomic conditional update (concurrency guard on previous status)
      const updateResult = await tx.kitchenUnit.updateMany({
        where: {
          id,
          status: unit.status,
        },
        data: {
          status: KitchenUnitStatus.DONE,
          startedAt,
          completedAt,
        },
      });

      if (updateResult.count === 0) {
        throw new ConflictException(
          `Concurrent update conflict: Kitchen unit '${id}' was modified by another operation`,
        );
      }

      // Ensure Order.kitchenStartedAt is recorded if null
      const orderStartUpdate = await tx.order.updateMany({
        where: {
          id: unit.orderId,
          kitchenStartedAt: null,
        },
        data: {
          kitchenStartedAt: startedAt,
        },
      });

      if (orderStartUpdate?.count > 0) {
        await tx.orderEvent.create({
          data: {
            orderId: unit.orderId,
            userId: userId || null,
            type: OrderEventType.KITCHEN_STARTED,
            note: `Kitchen production started (unit ${unit.id})`,
            occurredAt: startedAt,
          },
        });
      }

      // Check if ALL units for this order are now DONE
      const remainingIncomplete = await tx.kitchenUnit.count({
        where: {
          orderId: unit.orderId,
          status: { not: KitchenUnitStatus.DONE },
        },
      });

      if (remainingIncomplete === 0) {
        // Order is completely kitchen-ready!
        const readyUpdate = await tx.order.updateMany({
          where: {
            id: unit.orderId,
            kitchenReadyAt: null,
          },
          data: {
            kitchenReadyAt: completedAt,
          },
        });

        if (readyUpdate?.count > 0) {
          await tx.orderEvent.create({
            data: {
              orderId: unit.orderId,
              userId: userId || null,
              type: OrderEventType.KITCHEN_READY,
              note: `All kitchen units completed. Order is kitchen-ready.`,
              occurredAt: completedAt,
            },
          });
        }
      }

      return tx.kitchenUnit.findUnique({
        where: { id },
        include: {
          station: { select: { id: true, name: true } },
          order: {
            select: {
              id: true,
              orderNumber: true,
              status: true,
              kitchenStartedAt: true,
              kitchenReadyAt: true,
            },
          },
        },
      });
    });
  }

  /**
   * Admin Force-Complete:
   * - Restricted to kitchen.force_complete permission.
   * - Only applies to CONFIRMED orders.
   * - Incomplete units are transitioned to DONE.
   * - Already started units retain their actual startedAt; unstarted units record startedAt = now.
   * - Units already DONE remain untouched.
   * - Order becomes kitchen-ready with kitchenReadyAt recorded.
   * - 100% idempotent: repeated calls do not alter completed timestamps or duplicate events.
   */
  async forceCompleteOrder(
    orderId: string,
    userId?: string,
    now: Date = new Date(),
  ) {
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { id: orderId },
        include: {
          kitchenUnits: true,
        },
      });

      if (!order) {
        throw new NotFoundException(`Order with ID '${orderId}' not found`);
      }

      if (order.status !== OrderStatus.CONFIRMED) {
        throw new BadRequestException(
          `Cannot force-complete order '${order.orderNumber}' in '${order.status}' status. Only CONFIRMED orders can be force-completed in kitchen.`,
        );
      }

      // Ensure all combinations have units
      await this.ensureKitchenUnitsForOrder(orderId, tx);

      // Re-fetch all units for this order
      const units = await tx.kitchenUnit.findMany({
        where: { orderId },
      });

      const incompleteUnits = units.filter(
        (u) => u.status !== KitchenUnitStatus.DONE,
      );

      // Idempotency check: if all units are already done and kitchenReadyAt is set
      if (incompleteUnits.length === 0 && order.kitchenReadyAt) {
        return tx.order.findUnique({
          where: { id: orderId },
          include: {
            kitchenUnits: { include: { station: true } },
            events: { orderBy: { occurredAt: 'desc' }, take: 5 },
          },
        });
      }

      // Complete each incomplete unit
      for (const unit of incompleteUnits) {
        const startedAt = unit.startedAt || now;
        await tx.kitchenUnit.update({
          where: { id: unit.id },
          data: {
            status: KitchenUnitStatus.DONE,
            startedAt,
            completedAt: now,
          },
        });
      }

      // Update Order kitchenStartedAt and kitchenReadyAt
      const effectiveStartedAt = order.kitchenStartedAt || now;
      const effectiveReadyAt = order.kitchenReadyAt || now;

      await tx.order.update({
        where: { id: orderId },
        data: {
          kitchenStartedAt: effectiveStartedAt,
          kitchenReadyAt: effectiveReadyAt,
        },
      });

      // Record operational events only if not previously ready
      if (!order.kitchenReadyAt) {
        await tx.orderEvent.create({
          data: {
            orderId,
            userId: userId || null,
            type: OrderEventType.ADMIN_OVERRIDE,
            note: `Admin force-completed kitchen production for order ${order.orderNumber}`,
            occurredAt: now,
          },
        });

        await tx.orderEvent.create({
          data: {
            orderId,
            userId: userId || null,
            type: OrderEventType.KITCHEN_READY,
            note: `All kitchen units completed via admin force-complete`,
            occurredAt: now,
          },
        });
      }

      return tx.order.findUnique({
        where: { id: orderId },
        include: {
          kitchenUnits: {
            include: { station: true },
          },
          events: {
            orderBy: { occurredAt: 'desc' },
            take: 5,
          },
        },
      });
    });
  }
}
