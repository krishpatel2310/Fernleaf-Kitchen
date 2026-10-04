import { Test, TestingModule } from '@nestjs/testing';
import { DashboardsService } from './dashboards.service';
import { DashboardsController } from './dashboards.controller';
import { PrismaService } from '../prisma/prisma.service';
import { KitchenService } from '../kitchen/kitchen.service';
import { DispatchService } from '../dispatch/dispatch.service';
import { BillingService } from '../billing/billing.service';
import { SettingsService } from '../settings/settings.service';
import { OrderStatus, DropStatus } from '@prisma/client';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from '../auth/decorators/require-permissions.decorator';

describe('DashboardsService (Unit Tests)', () => {
  let service: DashboardsService;
  let controller: DashboardsController;
  let prisma: any;
  let kitchenService: any;
  let dispatchService: any;
  let billingService: any;
  let settingsService: any;

  beforeEach(async () => {
    prisma = {
      order: {
        findMany: jest.fn(),
        count: jest.fn(),
        aggregate: jest.fn(),
        groupBy: jest.fn(),
      },
      kitchenUnit: {
        findMany: jest.fn(),
      },
      kitchenStation: {
        findMany: jest.fn(),
      },
      drop: {
        findMany: jest.fn(),
        count: jest.fn(),
        groupBy: jest.fn(),
      },
      invoice: {
        findMany: jest.fn(),
        count: jest.fn(),
        aggregate: jest.fn(),
      },
      kitchenHoliday: {
        count: jest.fn(),
      },
      company: {
        count: jest.fn(),
      },
      user: {
        findUnique: jest.fn(),
      },
    };

    kitchenService = {
      ensureKitchenUnitsForDate: jest.fn().mockResolvedValue(undefined),
      getTimingStatus: jest.fn(),
    };

    dispatchService = {
      generateDropsForDate: jest.fn().mockResolvedValue(undefined),
      findDriverDrops: jest.fn(),
    };

    billingService = {
      findAllInvoices: jest.fn(),
    };

    settingsService = {
      getKitchenSettings: jest.fn(),
      getKitchenWorkingDays: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [DashboardsController],
      providers: [
        DashboardsService,
        { provide: PrismaService, useValue: prisma },
        { provide: KitchenService, useValue: kitchenService },
        { provide: DispatchService, useValue: dispatchService },
        { provide: BillingService, useValue: billingService },
        { provide: SettingsService, useValue: settingsService },
      ],
    }).compile();

    service = module.get<DashboardsService>(DashboardsService);
    controller = module.get<DashboardsController>(DashboardsController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ===========================================================================
  // RBAC & Permissions Metadata
  // ===========================================================================
  describe('RBAC & Permission Decorators', () => {
    const reflector = new Reflector();

    it('instantiates DashboardsController', () => {
      expect(controller).toBeDefined();
    });

    it('requires dashboard.admin permission on getAdminDashboard', () => {
      const perms = reflector.get<string[]>(
        PERMISSIONS_KEY,
        DashboardsController.prototype.getAdminDashboard,
      );
      expect(perms).toEqual(['dashboard.admin']);
    });

    it('requires dashboard.kitchen permission on getKitchenDashboard', () => {
      const perms = reflector.get<string[]>(
        PERMISSIONS_KEY,
        DashboardsController.prototype.getKitchenDashboard,
      );
      expect(perms).toEqual(['dashboard.kitchen']);
    });

    it('requires dashboard.dispatch permission on getDispatchDashboard', () => {
      const perms = reflector.get<string[]>(
        PERMISSIONS_KEY,
        DashboardsController.prototype.getDispatchDashboard,
      );
      expect(perms).toEqual(['dashboard.dispatch']);
    });

    it('requires dashboard.driver permission on getDriverDashboard', () => {
      const perms = reflector.get<string[]>(
        PERMISSIONS_KEY,
        DashboardsController.prototype.getDriverDashboard,
      );
      expect(perms).toEqual(['dashboard.driver']);
    });
  });

  // ===========================================================================
  // 1. ADMIN DASHBOARD
  // ===========================================================================
  describe('Admin Dashboard', () => {
    it('returns comprehensive admin metrics with correct status separation and billing semantics', async () => {
      // 1. Order status groups for today
      prisma.order.groupBy.mockResolvedValueOnce([
        { status: OrderStatus.CONFIRMED, _count: { status: 2 } },
        { status: OrderStatus.DRAFT, _count: { status: 1 } },
        { status: OrderStatus.PLACED, _count: { status: 1 } },
        { status: OrderStatus.CANCELLED, _count: { status: 1 } },
        { status: OrderStatus.REJECTED, _count: { status: 1 } },
      ]);

      // 2. Kitchen units for confirmed orders
      prisma.kitchenUnit.findMany.mockResolvedValueOnce([
        {
          id: 'ku-1',
          status: 'NOT_STARTED',
          completedAt: null,
          order: {
            id: 'ord-1',
            deliveryTimeMinutes: 720,
            plannedKitchenReadyAt: new Date(Date.now() + 5 * 60 * 1000), // AT_RISK (<15 min)
            deliveryDate: new Date('2026-10-04'),
            company: { deliveryMinutesBefore: 60 },
          },
        },
        {
          id: 'ku-2',
          status: 'IN_PROGRESS',
          completedAt: null,
          order: {
            id: 'ord-1',
            deliveryTimeMinutes: 720,
            plannedKitchenReadyAt: new Date(Date.now() + 60 * 60 * 1000), // ON_TRACK (>15 min)
            deliveryDate: new Date('2026-10-04'),
            company: { deliveryMinutesBefore: 60 },
          },
        },
        {
          id: 'ku-3',
          status: 'DONE',
          completedAt: new Date(),
          order: {
            id: 'ord-2',
            deliveryTimeMinutes: 780,
            plannedKitchenReadyAt: new Date(),
            deliveryDate: new Date('2026-10-04'),
            company: { deliveryMinutesBefore: 60 },
          },
        },
      ]);

      // Mock timing status from KitchenService
      kitchenService.getTimingStatus
        .mockReturnValueOnce({ timingStatus: 'AT_RISK' })
        .mockReturnValueOnce({ timingStatus: 'ON_TRACK' });

      // Confirmed orders with kitchen pending
      prisma.order.count.mockResolvedValueOnce(1);

      // 3. Drop status groups
      prisma.drop.groupBy.mockResolvedValueOnce([
        { status: DropStatus.KITCHEN_READY, _count: { status: 2 } },
        { status: DropStatus.DISPATCH_READY, _count: { status: 3 } },
        { status: DropStatus.OUT_FOR_DELIVERY, _count: { status: 1 } },
        { status: DropStatus.DELIVERED, _count: { status: 4 } },
      ]);

      // Unassigned drops count & assigned drops count
      prisma.drop.count
        .mockResolvedValueOnce(1) // unassigned
        .mockResolvedValueOnce(9); // assigned

      // 4. Billing counts & aggregates
      prisma.order.count.mockResolvedValueOnce(5); // uninvoiced confirmed orders
      prisma.order.aggregate.mockResolvedValueOnce({
        _sum: { totalCents: 12500 },
      });
      prisma.invoice.count
        .mockResolvedValueOnce(3) // issued invoices
        .mockResolvedValueOnce(8); // paid invoices
      prisma.invoice.aggregate
        .mockResolvedValueOnce({ _sum: { totalCents: 45000 } }) // issued sum
        .mockResolvedValueOnce({ _sum: { totalCents: 120000 } }); // paid sum

      // Mock issued invoices with orders for mismatch check
      prisma.invoice.findMany.mockResolvedValueOnce([
        {
          id: 'inv-1',
          orders: [
            {
              invoicedAmountCents: 1000,
              order: { totalCents: 1000, status: OrderStatus.CONFIRMED },
            },
          ],
        },
        {
          id: 'inv-2',
          orders: [
            {
              invoicedAmountCents: 2000,
              order: { totalCents: 2500, status: OrderStatus.CONFIRMED }, // mismatch
            },
          ],
        },
      ]);

      // 5. Configuration health
      settingsService.getKitchenSettings.mockResolvedValueOnce({
        cutoffTime: '10:00',
        cutoffWorkingDaysCount: 1,
        kitchenTimezone: 'Asia/Kolkata',
        defaultPriceTierId: 'tier-1',
        defaultPriceTierName: 'Standard',
      });
      settingsService.getKitchenWorkingDays.mockResolvedValueOnce([
        { dayOfWeek: 'MONDAY', isWorking: true },
        { dayOfWeek: 'TUESDAY', isWorking: true },
        { dayOfWeek: 'WEDNESDAY', isWorking: true },
        { dayOfWeek: 'THURSDAY', isWorking: true },
        { dayOfWeek: 'FRIDAY', isWorking: true },
        { dayOfWeek: 'SATURDAY', isWorking: false },
        { dayOfWeek: 'SUNDAY', isWorking: false },
      ]);
      prisma.kitchenHoliday.count.mockResolvedValueOnce(2);
      prisma.company.count.mockResolvedValueOnce(12);

      const result = await service.getAdminDashboard('2026-10-04');

      expect(result.date).toBe('2026-10-04');
      expect(result.timezone).toBe('Asia/Kolkata');

      // Orders overview
      expect(result.orders.totalOrdersToday).toBe(6);
      expect(result.orders.operationalOrdersToday).toBe(2); // Confirmed only (0 delivered)
      expect(result.orders.confirmedOrdersToday).toBe(2);
      expect(result.orders.placedOrdersToday).toBe(1);
      expect(result.orders.draftOrdersToday).toBe(1);
      expect(result.orders.cancelledOrdersToday).toBe(1);
      expect(result.orders.rejectedOrdersToday).toBe(1);

      // Kitchen risk (confirmed only)
      expect(result.kitchenRisk.totalKitchenUnits).toBe(3);
      expect(result.kitchenRisk.kitchenUnitsCompleted).toBe(1);
      expect(result.kitchenRisk.kitchenUnitsRemaining).toBe(2); // ku-1 + ku-2
      expect(result.kitchenRisk.atRiskUnitsCount).toBe(1);
      expect(result.kitchenRisk.lateUnitsCount).toBe(0);
      expect(result.kitchenRisk.overallKitchenStatus).toBe('AT_RISK');

      // Dispatch overview
      expect(result.dispatch.totalDropsToday).toBe(10);
      expect(result.dispatch.kitchenReadyDrops).toBe(2);
      expect(result.dispatch.dispatchReadyDrops).toBe(3);
      expect(result.dispatch.outForDeliveryDrops).toBe(1);
      expect(result.dispatch.deliveredDrops).toBe(4);
      expect(result.dispatch.unassignedDropsCount).toBe(1);
      expect(result.dispatch.assignedDropsCount).toBe(9);

      // Billing overview
      expect(result.billing.uninvoicedConfirmedOrderCount).toBe(5);
      expect(result.billing.uninvoicedConfirmedTotalCents).toBe(12500);
      expect(result.billing.issuedInvoiceCount).toBe(3);
      expect(result.billing.issuedInvoiceTotalCents).toBe(45000);
      expect(result.billing.paidInvoiceCount).toBe(8);
      expect(result.billing.paidInvoiceTotalCents).toBe(120000);
      expect(result.billing.invoicesWithAdjustmentsCount).toBe(1);

      // Configuration / Health
      expect(result.configuration.cutoffTime).toBe('10:00');
      expect(result.configuration.cutoffWorkingDaysCount).toBe(1);
      expect(result.configuration.activeCompaniesCount).toBe(12);
      expect(result.configuration.upcomingHolidaysCount).toBe(2);
      expect(result.configuration.activeWorkingDays.length).toBe(5);
    });

    it('excludes cancelled and rejected orders from active operational workload', async () => {
      prisma.order.groupBy.mockResolvedValueOnce([
        { status: OrderStatus.CANCELLED, _count: { status: 1 } },
        { status: OrderStatus.REJECTED, _count: { status: 1 } },
      ]);

      prisma.kitchenUnit.findMany.mockResolvedValueOnce([]);
      prisma.order.count.mockResolvedValue(0);
      prisma.drop.groupBy.mockResolvedValueOnce([]);
      prisma.drop.count.mockResolvedValue(0);
      prisma.order.aggregate.mockResolvedValue({ _sum: { totalCents: 0 } });
      prisma.invoice.count.mockResolvedValue(0);
      prisma.invoice.aggregate.mockResolvedValue({ _sum: { totalCents: 0 } });
      prisma.invoice.findMany.mockResolvedValue([]);
      settingsService.getKitchenSettings.mockResolvedValue({
        cutoffTime: '10:00',
        cutoffWorkingDaysCount: 1,
        kitchenTimezone: 'Asia/Kolkata',
        defaultPriceTierId: null,
        defaultPriceTierName: null,
      });
      settingsService.getKitchenWorkingDays.mockResolvedValue([]);
      prisma.kitchenHoliday.count.mockResolvedValue(0);
      prisma.company.count.mockResolvedValue(0);

      const result = await service.getAdminDashboard('2026-10-04');

      expect(result.orders.operationalOrdersToday).toBe(0);
      expect(result.orders.confirmedOrdersToday).toBe(0);
      expect(result.orders.cancelledOrdersToday).toBe(1);
      expect(result.orders.rejectedOrdersToday).toBe(1);
      expect(result.kitchenRisk.totalKitchenUnits).toBe(0);
      expect(result.kitchenRisk.kitchenUnitsRemaining).toBe(0);
    });

    it('operationalOrdersToday includes CONFIRMED and strictly excludes DELIVERED, DRAFT, PLACED, CANCELLED, REJECTED', async () => {
      prisma.order.groupBy.mockResolvedValueOnce([
        { status: OrderStatus.CONFIRMED, _count: { status: 5 } },
        { status: OrderStatus.DELIVERED, _count: { status: 3 } },
        { status: OrderStatus.DRAFT, _count: { status: 2 } },
        { status: OrderStatus.PLACED, _count: { status: 1 } },
        { status: OrderStatus.CANCELLED, _count: { status: 4 } },
        { status: OrderStatus.REJECTED, _count: { status: 1 } },
      ]);

      prisma.kitchenUnit.findMany.mockResolvedValueOnce([]);
      prisma.order.count.mockResolvedValue(0);
      prisma.drop.groupBy.mockResolvedValueOnce([]);
      prisma.drop.count.mockResolvedValue(0);
      prisma.order.aggregate.mockResolvedValue({ _sum: { totalCents: 0 } });
      prisma.invoice.count.mockResolvedValue(0);
      prisma.invoice.aggregate.mockResolvedValue({ _sum: { totalCents: 0 } });
      prisma.invoice.findMany.mockResolvedValue([]);
      settingsService.getKitchenSettings.mockResolvedValue({
        cutoffTime: '10:00',
        cutoffWorkingDaysCount: 1,
        kitchenTimezone: 'Asia/Kolkata',
        defaultPriceTierId: null,
        defaultPriceTierName: null,
      });
      settingsService.getKitchenWorkingDays.mockResolvedValue([]);
      prisma.kitchenHoliday.count.mockResolvedValue(0);
      prisma.company.count.mockResolvedValue(0);

      const result = await service.getAdminDashboard('2026-10-04');

      // 1. CONFIRMED is included
      expect(result.orders.operationalOrdersToday).toBe(5);
      expect(result.orders.confirmedOrdersToday).toBe(5);

      // 2. DELIVERED is NOT included in operationalOrdersToday, but counted separately in deliveredOrdersToday
      expect(result.orders.operationalOrdersToday).not.toBe(8); // 5 + 3 would be wrong
      expect(result.orders.deliveredOrdersToday).toBe(3);

      // 3. DRAFT is NOT included in operationalOrdersToday
      expect(result.orders.draftOrdersToday).toBe(2);

      // 4. PLACED is NOT included in operationalOrdersToday
      expect(result.orders.placedOrdersToday).toBe(1);

      // 5. CANCELLED is NOT included in operationalOrdersToday
      expect(result.orders.cancelledOrdersToday).toBe(4);

      // 6. REJECTED is NOT included in operationalOrdersToday
      expect(result.orders.rejectedOrdersToday).toBe(1);

      // 7. Total orders today equals sum of all statuses
      expect(result.orders.totalOrdersToday).toBe(16);

      // 8. Uses Asia/Kolkata delivery date
      expect(result.timezone).toBe('Asia/Kolkata');
      expect(result.date).toBe('2026-10-04');

      // 9. Old activeOperationalOrdersToday property is no longer present
      expect(
        (result.orders as any).activeOperationalOrdersToday,
      ).toBeUndefined();
    });
  });

  // ===========================================================================
  // 2. KITCHEN DASHBOARD
  // ===========================================================================
  describe('Kitchen Dashboard', () => {
    it('returns production workload, station breakdown, and surfaces unassigned stations', async () => {
      // Mock stations
      prisma.kitchenStation.findMany.mockResolvedValueOnce([
        { id: 'st-hot', name: 'Hot Station' },
      ]);

      // Mock confirmed kitchen units for production date
      prisma.kitchenUnit.findMany.mockResolvedValueOnce([
        {
          id: 'ku-1',
          status: 'NOT_STARTED',
          completedAt: null,
          stationId: 'st-hot',
          station: { id: 'st-hot', name: 'Hot Station' },
          orderCombination: {
            quantity: 1,
            orderLine: { dishNameSnapshot: 'Pasta' },
          },
          order: {
            id: 'ord-1',
            orderNumber: 'FK-2026-0001',
            deliveryDate: new Date('2026-10-04'),
            deliveryTimeMinutes: 720,
            plannedKitchenReadyAt: new Date(),
            plannedDispatchReadyAt: new Date(),
            company: { name: 'Acme Corp', deliveryMinutesBefore: 60 },
          },
        },
        {
          id: 'ku-2',
          status: 'IN_PROGRESS',
          completedAt: null,
          stationId: null, // Unassigned station
          station: null,
          orderCombination: {
            quantity: 1,
            orderLine: { dishNameSnapshot: 'Salad' },
          },
          order: {
            id: 'ord-1',
            orderNumber: 'FK-2026-0001',
            deliveryDate: new Date('2026-10-04'),
            deliveryTimeMinutes: 720,
            plannedKitchenReadyAt: new Date(),
            plannedDispatchReadyAt: new Date(),
            company: { name: 'Acme Corp', deliveryMinutesBefore: 60 },
          },
        },
        {
          id: 'ku-3',
          status: 'DONE',
          completedAt: new Date(),
          stationId: 'st-hot',
          station: { id: 'st-hot', name: 'Hot Station' },
          orderCombination: {
            quantity: 1,
            orderLine: { dishNameSnapshot: 'Pasta' },
          },
          order: {
            id: 'ord-1',
            orderNumber: 'FK-2026-0001',
            deliveryDate: new Date('2026-10-04'),
            deliveryTimeMinutes: 720,
            plannedKitchenReadyAt: new Date(),
            plannedDispatchReadyAt: new Date(),
            company: { name: 'Acme Corp', deliveryMinutesBefore: 60 },
          },
        },
      ]);

      const result = await service.getKitchenDashboard('2026-10-04');

      expect(result.date).toBe('2026-10-04');
      expect(result.summary.totalConfirmedOrders).toBe(1);
      expect(result.summary.totalUnits).toBe(3);
      expect(result.summary.unitsNotStarted).toBe(1);
      expect(result.summary.unitsInProgress).toBe(1);
      expect(result.summary.unitsDone).toBe(1);
      expect(result.summary.completedUnits).toBe(1);

      // Stations
      expect(result.stationWorkload.length).toBe(2);

      const hotStation = result.stationWorkload.find(
        (s) => s.stationName === 'Hot Station',
      );
      expect(hotStation).toBeDefined();
      expect(hotStation?.totalUnits).toBe(2);
      expect(hotStation?.notStarted).toBe(1);
      expect(hotStation?.done).toBe(1);

      const unassignedStation = result.stationWorkload.find(
        (s) => s.stationName === 'Unassigned Station',
      );
      expect(unassignedStation).toBeDefined();
      expect(unassignedStation?.stationId).toBe('unassigned');
      expect(unassignedStation?.totalUnits).toBe(1);
      expect(unassignedStation?.inProgress).toBe(1);
    });

    it('counts kitchen units by distinct order combination rather than order lines', async () => {
      prisma.kitchenStation.findMany.mockResolvedValueOnce([
        { id: 'st-main', name: 'Main' },
      ]);

      // 1 order with 2 kitchen units (distinct combinations)
      prisma.kitchenUnit.findMany.mockResolvedValueOnce([
        {
          id: 'ku-combo-1',
          status: 'DONE',
          completedAt: new Date(),
          stationId: 'st-main',
          station: { id: 'st-main', name: 'Main' },
          orderCombination: {
            quantity: 2,
            orderLine: { dishNameSnapshot: 'Dish 1' },
          },
          order: {
            id: 'ord-combos',
            orderNumber: 'FK-2026-0099',
            deliveryDate: new Date('2026-10-04'),
            deliveryTimeMinutes: 720,
            plannedKitchenReadyAt: new Date(),
            plannedDispatchReadyAt: new Date(),
            company: { name: 'Acme Corp', deliveryMinutesBefore: 60 },
          },
        },
        {
          id: 'ku-combo-2',
          status: 'NOT_STARTED',
          completedAt: null,
          stationId: 'st-main',
          station: { id: 'st-main', name: 'Main' },
          orderCombination: {
            quantity: 3,
            orderLine: { dishNameSnapshot: 'Dish 1' },
          },
          order: {
            id: 'ord-combos',
            orderNumber: 'FK-2026-0099',
            deliveryDate: new Date('2026-10-04'),
            deliveryTimeMinutes: 720,
            plannedKitchenReadyAt: new Date(),
            plannedDispatchReadyAt: new Date(),
            company: { name: 'Acme Corp', deliveryMinutesBefore: 60 },
          },
        },
      ]);

      const result = await service.getKitchenDashboard('2026-10-04');
      expect(result.summary.totalUnits).toBe(2);
      expect(result.summary.totalConfirmedOrders).toBe(1);
    });

    it('returns valid empty structures when there are no confirmed orders', async () => {
      prisma.kitchenStation.findMany.mockResolvedValueOnce([]);
      prisma.kitchenUnit.findMany.mockResolvedValueOnce([]);

      const result = await service.getKitchenDashboard('2026-10-04');

      expect(result.summary.totalConfirmedOrders).toBe(0);
      expect(result.summary.totalUnits).toBe(0);
      expect(result.stationWorkload).toEqual([]);
      expect(result.urgentUnits).toEqual([]);
    });
  });

  // ===========================================================================
  // 3. DISPATCH DASHBOARD
  // ===========================================================================
  describe('Dispatch Dashboard', () => {
    it('returns drop lifecycle counts, unassigned drops action list, and active deliveries', async () => {
      prisma.drop.findMany.mockResolvedValueOnce([
        {
          id: 'drop-1',
          status: DropStatus.KITCHEN_READY,
          deliveryTimeMinutes: 720,
          driverId: null, // Unassigned
          company: { id: 'comp-1', name: 'Acme Corp' },
          driver: null,
          orders: [{ orderId: 'ord-1' }, { orderId: 'ord-2' }],
          addressLine1Snapshot: '123 Main St',
          addressLine2Snapshot: 'Suite 400',
          citySnapshot: 'Metropolis',
          postalCodeSnapshot: '12345',
        },
        {
          id: 'drop-2',
          status: DropStatus.DISPATCH_READY,
          deliveryTimeMinutes: 750,
          driverId: 'drv-1',
          company: { id: 'comp-2', name: 'Beta Ltd' },
          driver: {
            id: 'drv-1',
            name: 'Dave Driver',
            email: 'driver@test.com',
          },
          orders: [{ orderId: 'ord-3' }],
          addressLine1Snapshot: '456 Market St',
          addressLine2Snapshot: null,
          citySnapshot: 'Metropolis',
          postalCodeSnapshot: '12345',
        },
        {
          id: 'drop-3',
          status: DropStatus.OUT_FOR_DELIVERY,
          deliveryTimeMinutes: 780,
          outForDeliveryAt: new Date(),
          driverId: 'drv-1',
          company: { id: 'comp-2', name: 'Beta Ltd' },
          driver: {
            id: 'drv-1',
            name: 'Dave Driver',
            email: 'driver@test.com',
          },
          orders: [{ orderId: 'ord-4' }],
          addressLine1Snapshot: '789 Broadway',
          addressLine2Snapshot: null,
          citySnapshot: 'Metropolis',
          postalCodeSnapshot: '12345',
        },
        {
          id: 'drop-4',
          status: DropStatus.DELIVERED,
          deliveryTimeMinutes: 660,
          driverId: 'drv-2',
          company: { id: 'comp-3', name: 'Gamma Inc' },
          driver: { id: 'drv-2', name: 'Dan Driver', email: 'dan@test.com' },
          orders: [{ orderId: 'ord-5' }],
          addressLine1Snapshot: '101 Pine St',
          addressLine2Snapshot: null,
          citySnapshot: 'Metropolis',
          postalCodeSnapshot: '12345',
        },
      ]);

      const result = await service.getDispatchDashboard('2026-10-04');

      expect(result.date).toBe('2026-10-04');
      expect(result.summary.totalDrops).toBe(4);
      expect(result.summary.totalOrdersInDrops).toBe(5);
      expect(result.summary.kitchenReadyDrops).toBe(1);
      expect(result.summary.dispatchReadyDrops).toBe(1);
      expect(result.summary.outForDeliveryDrops).toBe(1);
      expect(result.summary.deliveredDrops).toBe(1);
      expect(result.summary.unassignedDropsCount).toBe(1);
      expect(result.summary.assignedDropsCount).toBe(3);

      // Unassigned drops action list
      expect(result.unassignedActionList.length).toBe(1);
      expect(result.unassignedActionList[0].dropId).toBe('drop-1');
      expect(result.unassignedActionList[0].companyName).toBe('Acme Corp');
      expect(result.unassignedActionList[0].orderCount).toBe(2);
      expect(result.unassignedActionList[0].deliveryAddress).toContain(
        '123 Main St',
      );

      // Active deliveries list
      expect(result.activeDeliveries.length).toBe(1);
      expect(result.activeDeliveries[0].dropId).toBe('drop-3');
      expect(result.activeDeliveries[0].driverName).toBe('Dave Driver');
    });

    it('returns empty collections cleanly when no drops exist for the day', async () => {
      prisma.drop.findMany.mockResolvedValueOnce([]);

      const result = await service.getDispatchDashboard('2026-10-04');

      expect(result.summary.totalDrops).toBe(0);
      expect(result.unassignedActionList).toEqual([]);
      expect(result.activeDeliveries).toEqual([]);
    });
  });

  // ===========================================================================
  // 4. DRIVER DASHBOARD
  // ===========================================================================
  describe('Driver Dashboard', () => {
    it('scopes strictly to authenticated driver JWT and counts on-time vs late deliveries', async () => {
      const driverId = 'drv-authenticated-1';

      prisma.user.findUnique.mockResolvedValueOnce({
        id: driverId,
        name: 'Dave Driver',
        email: 'driver@test.com',
      });

      dispatchService.findDriverDrops.mockResolvedValueOnce({
        date: '2026-10-04',
        drops: [
          {
            id: 'drop-drv-1',
            companyName: 'Acme Corp',
            deliveryTimeMinutes: 720,
            deliveryTimeFormatted: '12:00 PM',
            address: {
              line1: '123 Main St',
              line2: null,
              city: 'Metropolis',
              state: 'State',
              postalCode: '12345',
            },
            standingInstructions: 'Call at reception',
            ordersCount: 3,
            status: DropStatus.DELIVERED,
            isOnTime: true,
          },
          {
            id: 'drop-drv-2',
            companyName: 'Beta Ltd',
            deliveryTimeMinutes: 750,
            deliveryTimeFormatted: '12:30 PM',
            address: {
              line1: '456 Market St',
              line2: null,
              city: 'Metropolis',
              state: 'State',
              postalCode: '12345',
            },
            standingInstructions: null,
            ordersCount: 2,
            status: DropStatus.DELIVERED,
            isOnTime: false, // Late delivery
          },
          {
            id: 'drop-drv-3',
            companyName: 'Gamma Inc',
            deliveryTimeMinutes: 800,
            deliveryTimeFormatted: '01:20 PM',
            address: {
              line1: '789 Broadway',
              line2: null,
              city: 'Metropolis',
              state: 'State',
              postalCode: '12345',
            },
            standingInstructions: 'Leave with guard',
            ordersCount: 1,
            status: DropStatus.OUT_FOR_DELIVERY,
            isOnTime: null,
          },
        ],
      });

      const result = await service.getDriverDashboard(driverId);

      expect(dispatchService.findDriverDrops).toHaveBeenCalledWith(
        driverId,
        expect.any(String), // today in Asia/Kolkata
        expect.any(Date),
      );

      expect(result.summary.todayAssignedDrops).toBe(3);
      expect(result.summary.deliveredCount).toBe(2);
      expect(result.summary.outForDeliveryCount).toBe(1);
      expect(result.summary.pendingDeliveries).toBe(1);
      expect(result.summary.onTimeCount).toBe(1);
      expect(result.summary.lateCount).toBe(1);

      // Next delivery should be the first pending or out-for-delivery drop
      expect(result.nextDelivery).toBeDefined();
      expect(result.nextDelivery?.dropId).toBe('drop-drv-3');
      expect(result.nextDelivery?.companyName).toBe('Gamma Inc');
      expect(result.nextDelivery?.driverInstructions).toBe('Leave with guard');

      // Schedule list
      expect(result.deliveries.length).toBe(3);
      expect(result.deliveries[0].dropId).toBe('drop-drv-1');
      expect(result.deliveries[1].isOnTime).toBe(false);
    });

    it('returns null nextDelivery when all drops are delivered', async () => {
      const driverId = 'drv-all-done';

      prisma.user.findUnique.mockResolvedValueOnce({
        id: driverId,
        name: 'Dave Driver',
        email: 'driver@test.com',
      });

      dispatchService.findDriverDrops.mockResolvedValueOnce({
        date: '2026-10-04',
        drops: [
          {
            id: 'drop-done-1',
            companyName: 'Acme Corp',
            deliveryTimeMinutes: 700,
            deliveryTimeFormatted: '11:40 AM',
            address: { line1: '123 Main St' },
            standingInstructions: null,
            ordersCount: 1,
            status: DropStatus.DELIVERED,
            isOnTime: true,
          },
        ],
      });

      const result = await service.getDriverDashboard(driverId);
      expect(result.summary.deliveredCount).toBe(1);
      expect(result.nextDelivery).toBeNull();
    });

    it('returns empty structure when driver has zero assigned drops today', async () => {
      const driverId = 'drv-no-drops';

      prisma.user.findUnique.mockResolvedValueOnce({
        id: driverId,
        name: 'Dave Driver',
        email: 'driver@test.com',
      });

      dispatchService.findDriverDrops.mockResolvedValueOnce({
        date: '2026-10-04',
        drops: [],
      });

      const result = await service.getDriverDashboard(driverId);

      expect(result.summary.todayAssignedDrops).toBe(0);
      expect(result.summary.deliveredCount).toBe(0);
      expect(result.nextDelivery).toBeNull();
      expect(result.deliveries).toEqual([]);
    });
  });
});
