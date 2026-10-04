import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DropStatus, OrderStatus } from '@prisma/client';
import {
  KitchenService,
  getTimingStatus,
  calculatePlannedTimings,
  KitchenTimingStatus,
} from '../kitchen/kitchen.service';
import { DispatchService } from '../dispatch/dispatch.service';
import { BillingService } from '../billing/billing.service';
import { SettingsService } from '../settings/settings.service';

/**
 * Returns current YYYY-MM-DD string in Asia/Kolkata timezone (UTC+05:30).
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
 * Converts a calendar date string (YYYY-MM-DD) into UTC midnight calendar date.
 */
export function parseKolkataCalendarDate(dateInput: Date | string): Date {
  if (typeof dateInput === 'string') {
    const parts = dateInput.split('T')[0].split('-').map(Number);
    return new Date(Date.UTC(parts[0], parts[1] - 1, parts[2], 0, 0, 0, 0));
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
 * Formats minute-of-day into 24-hour HH:mm string.
 */
export function formatMinutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60)
    .toString()
    .padStart(2, '0');
  const m = (minutes % 60).toString().padStart(2, '0');
  return `${h}:${m}`;
}

export interface StationWorkload {
  stationId: string;
  stationName: string;
  totalUnits: number;
  notStarted: number;
  inProgress: number;
  done: number;
  late: number;
  atRisk: number;
  onTrack: number;
}

@Injectable()
export class DashboardsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly kitchenService: KitchenService,
    private readonly dispatchService: DispatchService,
    private readonly billingService: BillingService,
    private readonly settingsService: SettingsService,
  ) {}

  /**
   * =========================================================================
   * 1. ADMIN DASHBOARD
   * =========================================================================
   * Provides high-level operational overview spanning:
   * A. Orders overview (today in Asia/Kolkata)
   * B. Kitchen risk overview (confirmed orders)
   * C. Dispatch & delivery overview (today's drops)
   * D. Billing overview (invoices & confirmed uninvoiced totals)
   * E. Operational configuration health
   */
  async getAdminDashboard(dateStr?: string, now: Date = new Date()) {
    const targetDateStr = dateStr || getKolkataDateString(now);
    const calendarDate = parseKolkataCalendarDate(targetDateStr);

    // -------------------------------------------------------------
    // A. Orders Overview (for targetDate in Asia/Kolkata)
    // -------------------------------------------------------------
    const orderGroups = await this.prisma.order.groupBy({
      by: ['status'],
      where: { deliveryDate: calendarDate },
      _count: { status: true },
    });

    const statusCounts = new Map<OrderStatus, number>();
    for (const g of orderGroups) {
      statusCounts.set(g.status, g._count.status);
    }

    const confirmedOrdersToday = statusCounts.get(OrderStatus.CONFIRMED) || 0;
    const deliveredOrdersToday = statusCounts.get(OrderStatus.DELIVERED) || 0;
    const placedOrdersToday = statusCounts.get(OrderStatus.PLACED) || 0;
    const draftOrdersToday = statusCounts.get(OrderStatus.DRAFT) || 0;
    const cancelledOrdersToday = statusCounts.get(OrderStatus.CANCELLED) || 0;
    const rejectedOrdersToday = statusCounts.get(OrderStatus.REJECTED) || 0;

    const totalOrdersToday = Array.from(statusCounts.values()).reduce(
      (sum, c) => sum + c,
      0,
    );

    // Operational orders represent current confirmed operational demand (strictly excludes completed DELIVERED, DRAFT, unconfirmed PLACED, CANCELLED, and REJECTED)
    const operationalOrdersToday = confirmedOrdersToday;

    // -------------------------------------------------------------
    // B. Kitchen Risk Overview (confirmed orders today)
    // -------------------------------------------------------------
    await this.kitchenService.ensureKitchenUnitsForDate(calendarDate);

    const units = await this.prisma.kitchenUnit.findMany({
      where: {
        order: {
          deliveryDate: calendarDate,
          status: OrderStatus.CONFIRMED,
        },
      },
      select: {
        id: true,
        status: true,
        completedAt: true,
        order: {
          select: {
            id: true,
            deliveryTimeMinutes: true,
            plannedKitchenReadyAt: true,
            deliveryDate: true,
            company: { select: { deliveryMinutesBefore: true } },
          },
        },
      },
    });

    let kitchenUnitsCompleted = 0;
    let lateUnitsCount = 0;
    let atRiskUnitsCount = 0;
    let onTrackUnitsCount = 0;

    for (const u of units) {
      if (u.status === 'DONE') {
        kitchenUnitsCompleted++;
        continue;
      }

      const plannedTimings = u.order.plannedKitchenReadyAt
        ? { plannedKitchenReadyAt: u.order.plannedKitchenReadyAt }
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

      if (timing.timingStatus === 'LATE') lateUnitsCount++;
      else if (timing.timingStatus === 'AT_RISK') atRiskUnitsCount++;
      else onTrackUnitsCount++;
    }

    const totalKitchenUnits = units.length;
    const kitchenUnitsRemaining = totalKitchenUnits - kitchenUnitsCompleted;

    let overallKitchenStatus: KitchenTimingStatus = 'ON_TRACK';
    if (lateUnitsCount > 0) {
      overallKitchenStatus = 'LATE';
    } else if (atRiskUnitsCount > 0) {
      overallKitchenStatus = 'AT_RISK';
    } else if (totalKitchenUnits > 0 && kitchenUnitsRemaining === 0) {
      overallKitchenStatus = 'COMPLETED';
    }

    const confirmedOrdersWithKitchenPending = await this.prisma.order.count({
      where: {
        deliveryDate: calendarDate,
        status: OrderStatus.CONFIRMED,
        kitchenReadyAt: null,
      },
    });

    // -------------------------------------------------------------
    // C. Dispatch & Delivery Overview (today's drops)
    // -------------------------------------------------------------
    await this.dispatchService.generateDropsForDate(targetDateStr, now);

    const dropGroups = await this.prisma.drop.groupBy({
      by: ['status'],
      where: { deliveryDate: calendarDate },
      _count: { status: true },
    });

    const dropStatusCounts = new Map<DropStatus, number>();
    for (const dg of dropGroups) {
      dropStatusCounts.set(dg.status, dg._count.status);
    }

    const totalDropsToday = Array.from(dropStatusCounts.values()).reduce(
      (sum, c) => sum + c,
      0,
    );
    const kitchenReadyDrops =
      dropStatusCounts.get(DropStatus.KITCHEN_READY) || 0;
    const dispatchReadyDrops =
      dropStatusCounts.get(DropStatus.DISPATCH_READY) || 0;
    const outForDeliveryDrops =
      dropStatusCounts.get(DropStatus.OUT_FOR_DELIVERY) || 0;
    const deliveredDrops = dropStatusCounts.get(DropStatus.DELIVERED) || 0;

    const unassignedDropsCount = await this.prisma.drop.count({
      where: {
        deliveryDate: calendarDate,
        driverId: null,
        status: { not: DropStatus.DELIVERED },
      },
    });

    const assignedDropsCount = await this.prisma.drop.count({
      where: {
        deliveryDate: calendarDate,
        driverId: { not: null },
      },
    });

    // -------------------------------------------------------------
    // D. Billing Overview (Authoritative integer cents)
    // -------------------------------------------------------------
    const [
      uninvoicedConfirmedOrderCount,
      uninvoicedSumAgg,
      issuedInvoiceCount,
      issuedInvoicesSumAgg,
      paidInvoiceCount,
      paidInvoicesSumAgg,
      issuedInvoicesWithOrders,
    ] = await Promise.all([
      // Uninvoiced confirmed orders count
      this.prisma.order.count({
        where: {
          status: OrderStatus.CONFIRMED,
          invoiceEntry: null,
        },
      }),
      // Uninvoiced confirmed orders sum
      this.prisma.order.aggregate({
        where: {
          status: OrderStatus.CONFIRMED,
          invoiceEntry: null,
        },
        _sum: { totalCents: true },
      }),
      // Issued (unpaid) invoices count
      this.prisma.invoice.count({
        where: { status: 'ISSUED' },
      }),
      // Issued (unpaid) invoices sum
      this.prisma.invoice.aggregate({
        where: { status: 'ISSUED' },
        _sum: { totalCents: true },
      }),
      // Paid invoices count
      this.prisma.invoice.count({
        where: { status: 'PAID' },
      }),
      // Paid invoices sum
      this.prisma.invoice.aggregate({
        where: { status: 'PAID' },
        _sum: { totalCents: true },
      }),
      // Check billing mismatches / adjustments on active issued invoices
      this.prisma.invoice.findMany({
        where: { status: 'ISSUED' },
        include: {
          orders: {
            include: {
              order: { select: { totalCents: true, status: true } },
            },
          },
        },
      }),
    ]);

    const uninvoicedConfirmedTotalCents = uninvoicedSumAgg._sum.totalCents || 0;

    const issuedInvoiceTotalCents = issuedInvoicesSumAgg._sum.totalCents || 0;

    const paidInvoiceTotalCents = paidInvoicesSumAgg._sum.totalCents || 0;

    let invoicesWithAdjustmentsCount = 0;
    for (const inv of issuedInvoicesWithOrders) {
      const hasMismatch = inv.orders.some(
        (io) =>
          io.invoicedAmountCents !== io.order.totalCents ||
          io.order.status === OrderStatus.CANCELLED,
      );
      if (hasMismatch) {
        invoicesWithAdjustmentsCount++;
      }
    }

    // -------------------------------------------------------------
    // E. Configuration / Operational Health
    // -------------------------------------------------------------
    const [
      kitchenSetting,
      workingDays,
      upcomingHolidaysCount,
      activeCompaniesCount,
    ] = await Promise.all([
      this.settingsService.getKitchenSettings(),
      this.settingsService.getKitchenWorkingDays(),
      this.prisma.kitchenHoliday.count({
        where: { date: { gte: calendarDate } },
      }),
      this.prisma.company.count(),
    ]);

    const activeWorkingDays = workingDays
      .filter((wd) => wd.isWorking)
      .map((wd) => wd.dayOfWeek);

    return {
      date: targetDateStr,
      generatedAt: now.toISOString(),
      timezone: 'Asia/Kolkata',
      orders: {
        totalOrdersToday,
        operationalOrdersToday,
        confirmedOrdersToday,
        placedOrdersToday,
        draftOrdersToday,
        deliveredOrdersToday,
        cancelledOrdersToday,
        rejectedOrdersToday,
      },
      kitchenRisk: {
        totalKitchenUnits,
        kitchenUnitsCompleted,
        kitchenUnitsRemaining,
        lateUnitsCount,
        atRiskUnitsCount,
        onTrackUnitsCount,
        confirmedOrdersWithKitchenPending,
        overallKitchenStatus,
      },
      dispatch: {
        totalDropsToday,
        kitchenReadyDrops,
        dispatchReadyDrops,
        outForDeliveryDrops,
        deliveredDrops,
        unassignedDropsCount,
        assignedDropsCount,
      },
      billing: {
        uninvoicedConfirmedOrderCount,
        uninvoicedConfirmedTotalCents,
        issuedInvoiceCount,
        issuedInvoiceTotalCents,
        paidInvoiceCount,
        paidInvoiceTotalCents,
        invoicesWithAdjustmentsCount,
      },
      configuration: {
        cutoffTime: kitchenSetting.cutoffTime,
        cutoffWorkingDaysCount: kitchenSetting.cutoffWorkingDaysCount,
        kitchenTimezone: kitchenSetting.kitchenTimezone,
        activeWorkingDays,
        upcomingHolidaysCount,
        activeCompaniesCount,
      },
    };
  }

  /**
   * =========================================================================
   * 2. KITCHEN DASHBOARD
   * =========================================================================
   * Focuses on commercial kitchen production workload for a specific date:
   * - Total confirmed kitchen units (distinct order combinations)
   * - Workload by station (and Unassigned station)
   * - Progress and timing status breakdown (late, at-risk, on-track)
   * - Urgent/at-risk units requiring immediate attention
   */
  async getKitchenDashboard(dateStr?: string, now: Date = new Date()) {
    const targetDateStr = dateStr || getKolkataDateString(now);
    const calendarDate = parseKolkataCalendarDate(targetDateStr);

    // Ensure all confirmed orders have units
    await this.kitchenService.ensureKitchenUnitsForDate(calendarDate);

    // Query active stations
    const stations = await this.prisma.kitchenStation.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });

    // Query all confirmed kitchen units for this date
    const units = await this.prisma.kitchenUnit.findMany({
      where: {
        order: {
          deliveryDate: calendarDate,
          status: OrderStatus.CONFIRMED,
        },
      },
      include: {
        station: { select: { id: true, name: true } },
        orderCombination: {
          select: {
            id: true,
            quantity: true,
            orderLine: {
              select: {
                dishNameSnapshot: true,
                dishSkuSnapshot: true,
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
            deliveryDate: true,
            company: {
              select: {
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

    const stationMap = new Map<string, StationWorkload>();
    for (const s of stations) {
      stationMap.set(s.id, {
        stationId: s.id,
        stationName: s.name,
        totalUnits: 0,
        notStarted: 0,
        inProgress: 0,
        done: 0,
        late: 0,
        atRisk: 0,
        onTrack: 0,
      });
    }

    const unassignedStation: StationWorkload = {
      stationId: 'unassigned',
      stationName: 'Unassigned Station',
      totalUnits: 0,
      notStarted: 0,
      inProgress: 0,
      done: 0,
      late: 0,
      atRisk: 0,
      onTrack: 0,
    };

    const totalUnits = units.length;
    let unitsNotStarted = 0;
    let unitsInProgress = 0;
    let unitsDone = 0;
    let lateUnits = 0;
    let atRiskUnits = 0;
    let onTrackUnits = 0;
    let completedUnits = 0;

    const orderIdSet = new Set<string>();
    const urgentUnitsList: any[] = [];

    for (const u of units) {
      orderIdSet.add(u.order.id);

      const plannedTimings =
        u.order.plannedKitchenReadyAt && u.order.plannedDispatchReadyAt
          ? {
              plannedKitchenReadyAt: u.order.plannedKitchenReadyAt,
              plannedDispatchReadyAt: u.order.plannedDispatchReadyAt,
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

      // Status counters
      if (u.status === 'NOT_STARTED') unitsNotStarted++;
      else if (u.status === 'IN_PROGRESS') unitsInProgress++;
      else if (u.status === 'DONE') {
        unitsDone++;
        completedUnits++;
      }

      // Timing counters (for pending units)
      if (u.status !== 'DONE') {
        if (timing.timingStatus === 'LATE') {
          lateUnits++;
          urgentUnitsList.push({
            unitId: u.id,
            orderNumber: u.order.orderNumber,
            companyName: u.order.company.name,
            dishName: u.orderCombination.orderLine.dishNameSnapshot,
            quantity: u.orderCombination.quantity,
            stationName: u.station?.name || 'Unassigned',
            deliveryTimeMinutes: u.order.deliveryTimeMinutes,
            formattedDeliveryTime: formatMinutesToTime(
              u.order.deliveryTimeMinutes,
            ),
            plannedKitchenReadyAt: plannedTimings.plannedKitchenReadyAt,
            timingStatus: 'LATE',
            delayMinutes: timing.delayMinutes,
          });
        } else if (timing.timingStatus === 'AT_RISK') {
          atRiskUnits++;
          urgentUnitsList.push({
            unitId: u.id,
            orderNumber: u.order.orderNumber,
            companyName: u.order.company.name,
            dishName: u.orderCombination.orderLine.dishNameSnapshot,
            quantity: u.orderCombination.quantity,
            stationName: u.station?.name || 'Unassigned',
            deliveryTimeMinutes: u.order.deliveryTimeMinutes,
            formattedDeliveryTime: formatMinutesToTime(
              u.order.deliveryTimeMinutes,
            ),
            plannedKitchenReadyAt: plannedTimings.plannedKitchenReadyAt,
            timingStatus: 'AT_RISK',
            delayMinutes: 0,
          });
        } else {
          onTrackUnits++;
        }
      }

      // Station workload accumulation
      const targetStation = u.stationId
        ? stationMap.get(u.stationId)
        : unassignedStation;

      if (targetStation) {
        targetStation.totalUnits++;
        if (u.status === 'NOT_STARTED') targetStation.notStarted++;
        else if (u.status === 'IN_PROGRESS') targetStation.inProgress++;
        else if (u.status === 'DONE') targetStation.done++;

        if (u.status !== 'DONE') {
          if (timing.timingStatus === 'LATE') targetStation.late++;
          else if (timing.timingStatus === 'AT_RISK') targetStation.atRisk++;
          else targetStation.onTrack++;
        }
      }
    }

    const stationWorkloadList = Array.from(stationMap.values());
    if (unassignedStation.totalUnits > 0) {
      stationWorkloadList.push(unassignedStation);
    }

    let overallKitchenStatus: KitchenTimingStatus = 'ON_TRACK';
    if (lateUnits > 0) overallKitchenStatus = 'LATE';
    else if (atRiskUnits > 0) overallKitchenStatus = 'AT_RISK';
    else if (totalUnits > 0 && unitsDone === totalUnits)
      overallKitchenStatus = 'COMPLETED';

    return {
      date: targetDateStr,
      generatedAt: now.toISOString(),
      timezone: 'Asia/Kolkata',
      summary: {
        totalConfirmedOrders: orderIdSet.size,
        totalUnits,
        unitsNotStarted,
        unitsInProgress,
        unitsDone,
        lateUnits,
        atRiskUnits,
        onTrackUnits,
        completedUnits,
        overallKitchenStatus,
      },
      stationWorkload: stationWorkloadList,
      urgentUnits: urgentUnitsList.slice(0, 20),
    };
  }

  /**
   * =========================================================================
   * 3. DISPATCH DASHBOARD
   * =========================================================================
   * Provides dispatch logistics and delivery readiness overview:
   * - Drops by status (KITCHEN_READY, DISPATCH_READY, OUT_FOR_DELIVERY, DELIVERED)
   * - Unassigned drops requiring immediate driver assignment
   * - Active deliveries currently en route
   */
  async getDispatchDashboard(dateStr?: string, now: Date = new Date()) {
    const targetDateStr = dateStr || getKolkataDateString(now);
    const calendarDate = parseKolkataCalendarDate(targetDateStr);

    // Ensure drops are reconciled
    await this.dispatchService.generateDropsForDate(targetDateStr, now);

    const drops = await this.prisma.drop.findMany({
      where: { deliveryDate: calendarDate },
      include: {
        company: {
          select: {
            id: true,
            name: true,
          },
        },
        driver: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        orders: {
          select: { orderId: true },
        },
      },
      orderBy: { deliveryTimeMinutes: 'asc' },
    });

    const totalDrops = drops.length;
    let kitchenReadyDrops = 0;
    let dispatchReadyDrops = 0;
    let outForDeliveryDrops = 0;
    let deliveredDrops = 0;
    let unassignedDropsCount = 0;
    let assignedDropsCount = 0;
    let totalOrdersInDrops = 0;

    const unassignedActionList: any[] = [];
    const activeDeliveries: any[] = [];

    for (const d of drops) {
      totalOrdersInDrops += d.orders.length;

      if (d.status === DropStatus.KITCHEN_READY) kitchenReadyDrops++;
      else if (d.status === DropStatus.DISPATCH_READY) dispatchReadyDrops++;
      else if (d.status === DropStatus.OUT_FOR_DELIVERY) outForDeliveryDrops++;
      else if (d.status === DropStatus.DELIVERED) deliveredDrops++;

      if (d.driverId) {
        assignedDropsCount++;
      } else {
        unassignedDropsCount++;
        if (d.status !== DropStatus.DELIVERED) {
          const address = [
            d.addressLine1Snapshot,
            d.addressLine2Snapshot,
            d.citySnapshot,
            d.postalCodeSnapshot,
          ]
            .filter(Boolean)
            .join(', ');

          unassignedActionList.push({
            dropId: d.id,
            companyName: d.company.name,
            deliveryAddress: address,
            deliveryTimeMinutes: d.deliveryTimeMinutes,
            formattedDeliveryTime: formatMinutesToTime(d.deliveryTimeMinutes),
            orderCount: d.orders.length,
            status: d.status,
          });
        }
      }

      if (d.status === DropStatus.OUT_FOR_DELIVERY) {
        activeDeliveries.push({
          dropId: d.id,
          companyName: d.company.name,
          driverName: d.driver?.name || 'Unassigned',
          driverEmail: d.driver?.email || null,
          deliveryTimeMinutes: d.deliveryTimeMinutes,
          formattedDeliveryTime: formatMinutesToTime(d.deliveryTimeMinutes),
          outForDeliveryAt: d.outForDeliveryAt,
          orderCount: d.orders.length,
        });
      }
    }

    return {
      date: targetDateStr,
      generatedAt: now.toISOString(),
      timezone: 'Asia/Kolkata',
      summary: {
        totalDrops,
        totalOrdersInDrops,
        kitchenReadyDrops,
        dispatchReadyDrops,
        outForDeliveryDrops,
        deliveredDrops,
        unassignedDropsCount,
        assignedDropsCount,
      },
      unassignedActionList,
      activeDeliveries,
    };
  }

  /**
   * =========================================================================
   * 4. DRIVER DASHBOARD
   * =========================================================================
   * Dedicated, strictly-isolated mobile delivery view for the authenticated driver:
   * - Restricted strictly to the driver's own assigned deliveries
   * - Enforces today's date in Asia/Kolkata
   * - Ordered chronologically by delivery time
   * - Exposes on-time vs late delivery counts and next actionable drop
   */
  async getDriverDashboard(driverUserId: string, now: Date = new Date()) {
    const driver = await this.prisma.user.findUnique({
      where: { id: driverUserId },
      select: { id: true, name: true, email: true },
    });

    if (!driver) {
      throw new NotFoundException(`Driver user '${driverUserId}' not found`);
    }

    const todayKolkataStr = getKolkataDateString(now);

    // Reuse DispatchService's authoritative driver deliveries lookup
    const { drops } = await this.dispatchService.findDriverDrops(
      driverUserId,
      todayKolkataStr,
      now,
    );

    const todayAssignedDrops = drops.length;
    let pendingDeliveries = 0;
    let outForDeliveryCount = 0;
    let deliveredCount = 0;
    let onTimeCount = 0;
    let lateCount = 0;

    let nextDelivery: any = null;

    for (const d of drops) {
      if (d.status === DropStatus.DELIVERED) {
        deliveredCount++;
        if (d.isOnTime === true) onTimeCount++;
        else if (d.isOnTime === false) lateCount++;
      } else {
        pendingDeliveries++;
        if (d.status === DropStatus.OUT_FOR_DELIVERY) {
          outForDeliveryCount++;
        }
        if (!nextDelivery) {
          const addressStr = [
            d.address.line1,
            d.address.line2,
            d.address.city,
            d.address.postalCode,
          ]
            .filter(Boolean)
            .join(', ');

          nextDelivery = {
            dropId: d.id,
            companyName: d.companyName,
            deliveryAddress: addressStr,
            deliveryTimeMinutes: d.deliveryTimeMinutes,
            formattedDeliveryTime: d.deliveryTimeFormatted,
            status: d.status,
            driverInstructions: d.standingInstructions,
            ordersCount: d.ordersCount,
          };
        }
      }
    }

    return {
      date: todayKolkataStr,
      generatedAt: now.toISOString(),
      timezone: 'Asia/Kolkata',
      driver: {
        id: driver.id,
        name: driver.name,
        email: driver.email,
      },
      summary: {
        todayAssignedDrops,
        pendingDeliveries,
        outForDeliveryCount,
        deliveredCount,
        onTimeCount,
        lateCount,
      },
      nextDelivery,
      deliveries: drops.map((d: any) => {
        const addressStr = [
          d.address.line1,
          d.address.line2,
          d.address.city,
          d.address.postalCode,
        ]
          .filter(Boolean)
          .join(', ');

        return {
          dropId: d.id,
          companyName: d.companyName,
          deliveryAddress: addressStr,
          deliveryTimeMinutes: d.deliveryTimeMinutes,
          formattedDeliveryTime: d.deliveryTimeFormatted,
          status: d.status,
          driverInstructions: d.standingInstructions,
          ordersCount: d.ordersCount,
          outForDeliveryAt: d.outForDeliveryAt,
          deliveredAt: d.deliveredAt,
          isOnTime: d.isOnTime,
        };
      }),
    };
  }
}
