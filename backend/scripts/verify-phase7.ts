import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import * as http from 'http';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { PrismaClient, OrderStatus, KitchenUnitStatus, OrderEventType } from '@prisma/client';

const prisma = new PrismaClient();

interface RequestOptions {
  method: string;
  path: string;
  headers?: Record<string, string>;
  body?: any;
}

interface ResponseResult {
  status: number;
  data: any;
  headers: http.IncomingHttpHeaders;
}

function makeRequest(options: RequestOptions): Promise<ResponseResult> {
  return new Promise((resolve, reject) => {
    const postData = options.body ? JSON.stringify(options.body) : undefined;
    const reqHeaders: Record<string, string> = {
      ...(options.headers || {}),
    };
    if (postData) {
      reqHeaders['Content-Type'] = 'application/json';
      reqHeaders['Content-Length'] = Buffer.byteLength(postData).toString();
    }

    const req = http.request(
      {
        hostname: 'localhost',
        port: 4001,
        path: options.path,
        method: options.method,
        headers: reqHeaders,
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => {
          let parsedData = body;
          try {
            parsedData = JSON.parse(body);
          } catch {
            // Keep string
          }
          resolve({
            status: res.statusCode || 0,
            data: parsedData,
            headers: res.headers,
          });
        });
      },
    );

    req.on('error', (err) => reject(err));
    if (postData) req.write(postData);
    req.end();
  });
}

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
  console.log(`  ✓ ${message}`);
}

async function runLiveVerification() {
  console.log('====================================================');
  console.log('PHASE 7 LIVE HTTP API VERIFICATION SUITE');
  console.log('====================================================\n');

  let app: INestApplication;
  try {
    app = await NestFactory.create(AppModule, { logger: ['warn', 'error'] });
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.listen(4001);
    console.log('🚀 Test server started on http://localhost:4001/api\n');
  } catch (err) {
    console.error('Failed to start test server:', err);
    process.exit(1);
  }

  try {
    // -------------------------------------------------------------------------
    // 1. Authentication & Role Tokens
    // -------------------------------------------------------------------------
    console.log('1. Authenticating Roles (Admin, Kitchen Lead, Driver)...');

    const adminLogin = await makeRequest({
      method: 'POST',
      path: '/api/auth/login',
      body: { email: 'admin@test.com', password: 'Test@1234' },
    });
    assert(adminLogin.status === 200 && !!adminLogin.data.accessToken, 'Admin login succeeded with token');
    const adminToken = adminLogin.data.accessToken;

    const kitchenLogin = await makeRequest({
      method: 'POST',
      path: '/api/auth/login',
      body: { email: 'kitchen@test.com', password: 'Test@1234' },
    });
    assert(kitchenLogin.status === 200 && !!kitchenLogin.data.accessToken, 'Kitchen login succeeded with token');
    const kitchenToken = kitchenLogin.data.accessToken;

    const driverLogin = await makeRequest({
      method: 'POST',
      path: '/api/auth/login',
      body: { email: 'driver@test.com', password: 'Test@1234' },
    });
    assert(driverLogin.status === 200 && !!driverLogin.data.accessToken, 'Driver login succeeded with token');
    const driverToken = driverLogin.data.accessToken;

    const authHeaders = (token: string) => ({ Authorization: `Bearer ${token}` });

    // -------------------------------------------------------------------------
    // 2. Kitchen Board for Selected Date (Today in Asia/Kolkata)
    // -------------------------------------------------------------------------
    console.log('\n2. Querying Kitchen Board for Today in Asia/Kolkata...');
    const todayKolkataStr = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());

    const boardRes = await makeRequest({
      method: 'GET',
      path: `/api/kitchen/board?date=${todayKolkataStr}`,
      headers: authHeaders(kitchenToken),
    });

    assert(boardRes.status === 200, `Board query succeeded with status 200`);
    assert(boardRes.data.date === todayKolkataStr, `Board date matches requested date: ${todayKolkataStr}`);
    assert(typeof boardRes.data.summary === 'object', 'Board response includes summary statistics');
    assert(Array.isArray(boardRes.data.units), 'Board response includes units array');
    console.log(`  Summary: ${boardRes.data.summary.totalOrders} orders, ${boardRes.data.summary.totalUnits} units`);

    // -------------------------------------------------------------------------
    // 3. Confirmed Orders Appear on Kitchen Board
    // -------------------------------------------------------------------------
    console.log('\n3. Verifying Confirmed Orders Appear on Board...');
    const orderNumbersOnBoard = new Set(boardRes.data.units.map((u: any) => u.orderNumber));
    assert(orderNumbersOnBoard.has('FK-2026-K001'), 'Confirmed order FK-2026-K001 appears on board');
    assert(orderNumbersOnBoard.has('FK-2026-K002'), 'Confirmed order FK-2026-K002 appears on board');
    assert(orderNumbersOnBoard.has('FK-2026-K003'), 'Confirmed order FK-2026-K003 appears on board');

    // -------------------------------------------------------------------------
    // 4. Non-Confirmed Orders (DRAFT, PLACED, CANCELLED, REJECTED) Excluded
    // -------------------------------------------------------------------------
    console.log('\n4. Verifying Non-Confirmed Orders are Excluded...');
    assert(!orderNumbersOnBoard.has('FK-2026-0001'), 'DELIVERED order FK-2026-0001 is excluded from active board');
    assert(!orderNumbersOnBoard.has('FK-2026-0003'), 'PLACED order FK-2026-0003 is excluded from active board');
    assert(!orderNumbersOnBoard.has('FK-2026-0004'), 'DRAFT order FK-2026-0004 is excluded from active board');
    assert(!orderNumbersOnBoard.has('FK-2026-0005'), 'CANCELLED order FK-2026-0005 is excluded from active board');
    assert(!orderNumbersOnBoard.has('FK-2026-0006'), 'REJECTED order FK-2026-0006 is excluded from active board');

    // -------------------------------------------------------------------------
    // 5. Kitchen Unit Count Matches Distinct Combinations (1 Combination = 1 Unit)
    // -------------------------------------------------------------------------
    console.log('\n5. Verifying Kitchen Unit Invariant: ONE Combination = ONE Unit...');
    const orderK001 = await prisma.order.findUnique({
      where: { orderNumber: 'FK-2026-K001' },
      include: { lines: { include: { combinations: true } }, kitchenUnits: true },
    });
    assert(!!orderK001, 'Order FK-2026-K001 found in DB');
    const totalCombosK001 = orderK001!.lines.reduce((sum, l) => sum + l.combinations.length, 0);
    assert(
      orderK001!.kitchenUnits.length === totalCombosK001,
      `Order FK-2026-K001 has ${orderK001!.kitchenUnits.length} KitchenUnits matching ${totalCombosK001} distinct combinations`,
    );

    // -------------------------------------------------------------------------
    // 6. Start Kitchen Unit (NOT_STARTED -> IN_PROGRESS)
    // -------------------------------------------------------------------------
    console.log('\n6. Testing Kitchen Unit Start Action...');
    // Find a NOT_STARTED unit on FK-2026-K003
    const orderK003 = await prisma.order.findUnique({
      where: { orderNumber: 'FK-2026-K003' },
      include: { kitchenUnits: true },
    });
    const notStartedUnit = orderK003!.kitchenUnits.find((u) => u.status === KitchenUnitStatus.NOT_STARTED)!;
    assert(!!notStartedUnit, 'Found NOT_STARTED unit on FK-2026-K003');

    const startRes = await makeRequest({
      method: 'POST',
      path: `/api/kitchen/units/${notStartedUnit.id}/start`,
      headers: authHeaders(kitchenToken),
    });
    assert(startRes.status === 200, 'Start unit HTTP endpoint returned 200 OK');
    assert(startRes.data.status === KitchenUnitStatus.IN_PROGRESS, 'Unit transitioned to IN_PROGRESS');
    assert(!!startRes.data.startedAt, 'Unit startedAt timestamp recorded');

    // DB verification
    const dbUnitAfterStart = await prisma.kitchenUnit.findUnique({ where: { id: notStartedUnit.id } });
    assert(dbUnitAfterStart!.status === KitchenUnitStatus.IN_PROGRESS, 'DB: Unit status is IN_PROGRESS');
    assert(dbUnitAfterStart!.startedAt !== null, 'DB: startedAt is set');

    // -------------------------------------------------------------------------
    // 7. Cannot Start Unit Twice (Conflict)
    // -------------------------------------------------------------------------
    console.log('\n7. Verifying Unit Cannot Start Twice...');
    const secondStartRes = await makeRequest({
      method: 'POST',
      path: `/api/kitchen/units/${notStartedUnit.id}/start`,
      headers: authHeaders(kitchenToken),
    });
    assert(secondStartRes.status === 409, 'Duplicate start returned 409 Conflict');

    // -------------------------------------------------------------------------
    // 8. Order kitchenStartedAt Behavior
    // -------------------------------------------------------------------------
    console.log('\n8. Verifying Order kitchenStartedAt Lifecycle...');
    const dbOrderK003AfterFirstStart = await prisma.order.findUnique({ where: { orderNumber: 'FK-2026-K003' } });
    assert(dbOrderK003AfterFirstStart!.kitchenStartedAt !== null, 'order.kitchenStartedAt was set upon first unit start');
    const originalOrderStartTime = dbOrderK003AfterFirstStart!.kitchenStartedAt!.getTime();

    // Start a second unit on the same order if available
    const secondUnitOnK003 = orderK003!.kitchenUnits.find((u) => u.id !== notStartedUnit.id);
    if (secondUnitOnK003 && secondUnitOnK003.status === KitchenUnitStatus.NOT_STARTED) {
      await makeRequest({
        method: 'POST',
        path: `/api/kitchen/units/${secondUnitOnK003.id}/start`,
        headers: authHeaders(kitchenToken),
      });
      const dbOrderAfterSecondStart = await prisma.order.findUnique({ where: { orderNumber: 'FK-2026-K003' } });
      assert(
        dbOrderAfterSecondStart!.kitchenStartedAt!.getTime() === originalOrderStartTime,
        'order.kitchenStartedAt was NOT overwritten when subsequent unit started',
      );
    }

    // -------------------------------------------------------------------------
    // 9. Finish Unit (IN_PROGRESS -> DONE)
    // -------------------------------------------------------------------------
    console.log('\n9. Testing Kitchen Unit Finish Action...');
    const finishRes = await makeRequest({
      method: 'POST',
      path: `/api/kitchen/units/${notStartedUnit.id}/finish`,
      headers: authHeaders(kitchenToken),
    });
    assert(finishRes.status === 200, 'Finish unit HTTP endpoint returned 200 OK');
    assert(finishRes.data.status === KitchenUnitStatus.DONE, 'Unit status is DONE');
    assert(!!finishRes.data.finishedAt || !!finishRes.data.completedAt, 'finishedAt/completedAt timestamp recorded');

    // DB verification
    const dbUnitAfterFinish = await prisma.kitchenUnit.findUnique({ where: { id: notStartedUnit.id } });
    assert(dbUnitAfterFinish!.status === KitchenUnitStatus.DONE, 'DB: Unit status is DONE');
    assert(dbUnitAfterFinish!.completedAt !== null, 'DB: completedAt is set');

    // -------------------------------------------------------------------------
    // 10. Cannot Finish Unit Twice (Conflict)
    // -------------------------------------------------------------------------
    console.log('\n10. Verifying Unit Cannot Finish Twice...');
    const secondFinishRes = await makeRequest({
      method: 'POST',
      path: `/api/kitchen/units/${notStartedUnit.id}/finish`,
      headers: authHeaders(kitchenToken),
    });
    assert(secondFinishRes.status === 409, 'Duplicate finish returned 409 Conflict');

    // -------------------------------------------------------------------------
    // 11. Finish-Without-Start Behavior
    // -------------------------------------------------------------------------
    console.log('\n11. Testing Finish-Without-Start Behavior...');
    // Create a fresh test order with NOT_STARTED units to test finish-without-start
    const validAddress = await prisma.companyAddress.findFirst({ where: { companyId: orderK003!.companyId } });
    const testDirectFinishOrder = await prisma.order.create({
      data: {
        orderNumber: 'FK-TEST-DIRECT-FINISH',
        employeeId: orderK003!.employeeId,
        companyId: orderK003!.companyId,
        deliveryDate: new Date('2026-10-20T00:00:00.000Z'),
        deliveryTimeMinutes: 750,
        packagingTypeId: orderK003!.packagingTypeId,
        status: OrderStatus.CONFIRMED,
        totalCents: 850,
        delivery: {
          create: {
            companyAddressId: validAddress!.id,
            addressLabelSnapshot: 'Test Label',
            addressLine1Snapshot: 'Test Line 1',
            citySnapshot: 'Bengaluru',
            stateSnapshot: 'Karnataka',
            postalCodeSnapshot: '560001',
            deliveryTimeMinutes: 750,
            packagingNameSnapshot: 'Eco Box',
          },
        },
        lines: {
          create: [
            {
              dishId: (await prisma.dish.findFirst())!.id,
              dishNameSnapshot: 'Test Dish',
              dishSkuSnapshot: 'TEST-SKU',
              dishUnitPriceCents: 850,
              quantity: 1,
              lineTotalCents: 850,
              combinations: {
                create: [
                  {
                    quantity: 1,
                    unitPriceCents: 850,
                    combinationTotalCents: 850,
                  },
                ],
              },
            },
          ],
        },
      },
      include: { lines: { include: { combinations: true } } },
    });

    const comboDirect = testDirectFinishOrder.lines[0].combinations[0];
    const directUnit = await prisma.kitchenUnit.create({
      data: {
        orderId: testDirectFinishOrder.id,
        orderCombinationId: comboDirect.id,
        status: KitchenUnitStatus.NOT_STARTED,
        startedAt: null,
        completedAt: null,
      },
    });

    // Call finish directly on the NOT_STARTED unit
    const directFinishRes = await makeRequest({
      method: 'POST',
      path: `/api/kitchen/units/${directUnit.id}/finish`,
      headers: authHeaders(kitchenToken),
    });
    assert(directFinishRes.status === 200, 'Finish-without-start succeeded with 200 OK');
    assert(directFinishRes.data.status === KitchenUnitStatus.DONE, 'Unit transitioned directly to DONE');
    assert(!!directFinishRes.data.startedAt, 'startedAt was automatically recorded on finish-without-start');
    assert(!!directFinishRes.data.completedAt, 'completedAt was recorded on finish-without-start');

    // -------------------------------------------------------------------------
    // 12. Partial Completion Does NOT Mark Order Ready
    // -------------------------------------------------------------------------
    console.log('\n12. Verifying Partial Completion Does NOT Mark Order Ready...');
    const orderK001State = await prisma.order.findUnique({
      where: { orderNumber: 'FK-2026-K001' },
      include: { kitchenUnits: true },
    });
    const hasIncomplete = orderK001State!.kitchenUnits.some((u) => u.status !== KitchenUnitStatus.DONE);
    assert(hasIncomplete, 'FK-2026-K001 has at least one incomplete unit');
    assert(orderK001State!.kitchenReadyAt === null, 'order.kitchenReadyAt is null when some units are incomplete');

    // -------------------------------------------------------------------------
    // 13. Final Completion Marks Order Ready (kitchenReadyAt)
    // -------------------------------------------------------------------------
    console.log('\n13. Verifying Final Unit Completion Sets kitchenReadyAt...');
    // FK-2026-K002 was seeded with ALL units DONE
    const orderK002State = await prisma.order.findUnique({
      where: { orderNumber: 'FK-2026-K002' },
      include: { kitchenUnits: true },
    });
    const allDoneK002 = orderK002State!.kitchenUnits.every((u) => u.status === KitchenUnitStatus.DONE);
    assert(allDoneK002, 'All units for FK-2026-K002 are DONE');
    assert(orderK002State!.kitchenReadyAt !== null, 'order.kitchenReadyAt is set when all units are DONE');

    // Complete the remaining unit on testDirectFinishOrder to verify real-time transition
    const dbTestOrder = await prisma.order.findUnique({ where: { id: testDirectFinishOrder.id } });
    assert(dbTestOrder!.kitchenReadyAt !== null, 'Test order became kitchen-ready when its final unit finished');

    // -------------------------------------------------------------------------
    // 14. Planned Timing Calculations (Lead Time & 30-min Offset)
    // -------------------------------------------------------------------------
    console.log('\n14. Verifying Planned Timing Values and Offsets...');
    // In FK-2026-K002: delivery is 13:00 (780 min). Company lead is 45 min.
    // plannedDispatchReadyAt = 13:00 - 45m = 12:15.
    // plannedKitchenReadyAt = 12:15 - 30m = 11:45.
    const unitK002 = boardRes.data.units.find((u: any) => u.orderNumber === 'FK-2026-K002');
    assert(!!unitK002, 'Found unit for FK-2026-K002 on board');
    const dispatchTime = new Date(unitK002.plannedDispatchReadyAt).getTime();
    const kitchenTime = new Date(unitK002.plannedKitchenReadyAt).getTime();
    const diffMinutes = (dispatchTime - kitchenTime) / (60 * 1000);
    assert(diffMinutes === 30, `Planned kitchen-ready is exactly 30 minutes before planned dispatch-ready (${diffMinutes} min diff)`);

    // -------------------------------------------------------------------------
    // 15. Late / At-Risk Deterministic Indicators
    // -------------------------------------------------------------------------
    console.log('\n15. Verifying Late / At-Risk Indicators on Board...');
    const validTimingStatuses = ['ON_TRACK', 'AT_RISK', 'LATE', 'COMPLETED'];
    for (const unit of boardRes.data.units) {
      assert(
        validTimingStatuses.includes(unit.timingStatus),
        `Unit ${unit.id} has deterministic timingStatus: ${unit.timingStatus}`,
      );
    }
    // Verify completed units show COMPLETED
    const completedUnit = boardRes.data.units.find((u: any) => u.status === 'DONE');
    if (completedUnit) {
      assert(completedUnit.timingStatus === 'COMPLETED', `DONE unit has timingStatus = COMPLETED`);
    }

    // -------------------------------------------------------------------------
    // 16. Delivery Time Override Recalculates Plan
    // -------------------------------------------------------------------------
    console.log('\n16. Testing Delivery Time Override Plan Recalculation...');
    // Create an order and override delivery time via admin endpoint
    const overrideOrder = await prisma.order.create({
      data: {
        orderNumber: 'FK-TEST-OVERRIDE',
        employeeId: orderK003!.employeeId,
        companyId: orderK003!.companyId,
        deliveryDate: new Date('2026-10-25T00:00:00.000Z'),
        deliveryTimeMinutes: 720, // 12:00
        packagingTypeId: orderK003!.packagingTypeId,
        status: OrderStatus.CONFIRMED,
        totalCents: 850,
        delivery: {
          create: {
            companyAddressId: validAddress!.id,
            addressLabelSnapshot: 'Test Label',
            addressLine1Snapshot: 'Test Line 1',
            citySnapshot: 'Bengaluru',
            stateSnapshot: 'Karnataka',
            postalCodeSnapshot: '560001',
            deliveryTimeMinutes: 720,
            packagingNameSnapshot: 'Eco Box',
          },
        },
      },
    });

    const overrideRes = await makeRequest({
      method: 'POST',
      path: `/api/orders/${overrideOrder.id}/override`,
      headers: authHeaders(adminToken),
      body: {
        deliveryTimeMinutes: 840, // change to 14:00 (+120 min)
        note: 'Customer requested 2 hour delay for board meeting',
      },
    });
    assert(overrideRes.status === 200, 'Admin override succeeded with 200 OK');

    const updatedOverrideOrder = await prisma.order.findUnique({ where: { id: overrideOrder.id } });
    assert(updatedOverrideOrder!.deliveryTimeMinutes === 840, 'Order deliveryTimeMinutes updated to 840');
    assert(
      updatedOverrideOrder!.plannedDispatchReadyAt !== null && updatedOverrideOrder!.plannedKitchenReadyAt !== null,
      'plannedDispatchReadyAt and plannedKitchenReadyAt were recalculated upon delivery time change',
    );

    // -------------------------------------------------------------------------
    // 17. Admin Force-Complete
    // -------------------------------------------------------------------------
    console.log('\n17. Testing Admin Force-Complete Endpoint...');
    // Force-complete FK-2026-K001 which has incomplete units
    const forceRes = await makeRequest({
      method: 'POST',
      path: `/api/kitchen/orders/${orderK001!.id}/force-complete`,
      headers: authHeaders(adminToken),
    });
    assert(forceRes.status === 200, 'Admin force-complete succeeded with 200 OK');

    // DB verification: all units are now DONE and order is kitchen-ready
    const dbUnitsK001AfterForce = await prisma.kitchenUnit.findMany({ where: { orderId: orderK001!.id } });
    assert(
      dbUnitsK001AfterForce.every((u) => u.status === KitchenUnitStatus.DONE),
      'All units for FK-2026-K001 transitioned to DONE after force-complete',
    );
    const dbOrderK001AfterForce = await prisma.order.findUnique({ where: { id: orderK001!.id } });
    assert(dbOrderK001AfterForce!.kitchenReadyAt !== null, 'Order kitchenReadyAt is set after force-complete');

    // -------------------------------------------------------------------------
    // 18. Repeated Force-Complete Idempotency
    // -------------------------------------------------------------------------
    console.log('\n18. Verifying Repeated Force-Complete is Idempotent...');
    const readyAtFirst = dbOrderK001AfterForce!.kitchenReadyAt!.getTime();
    const secondForceRes = await makeRequest({
      method: 'POST',
      path: `/api/kitchen/orders/${orderK001!.id}/force-complete`,
      headers: authHeaders(adminToken),
    });
    assert(secondForceRes.status === 200, 'Second force-complete succeeded with 200 OK');
    const dbOrderK001AfterSecondForce = await prisma.order.findUnique({ where: { id: orderK001!.id } });
    assert(
      dbOrderK001AfterSecondForce!.kitchenReadyAt!.getTime() === readyAtFirst,
      'kitchenReadyAt timestamp unchanged on repeated force-complete',
    );

    // -------------------------------------------------------------------------
    // 19. Kitchen RBAC & Authorization
    // -------------------------------------------------------------------------
    console.log('\n19. Testing Kitchen RBAC Enforcement...');
    // Kitchen Lead can read board, start, finish
    const kitchenBoardAuth = await makeRequest({
      method: 'GET',
      path: `/api/kitchen/board?date=${todayKolkataStr}`,
      headers: authHeaders(kitchenToken),
    });
    assert(kitchenBoardAuth.status === 200, 'Kitchen lead has kitchen.read access');

    // Kitchen lead should NOT have kitchen.force_complete permission
    const kitchenForceAttempt = await makeRequest({
      method: 'POST',
      path: `/api/kitchen/orders/${orderK003!.id}/force-complete`,
      headers: authHeaders(kitchenToken),
    });
    assert(kitchenForceAttempt.status === 403, 'Kitchen lead without force_complete permission is rejected with 403 Forbidden');

    // -------------------------------------------------------------------------
    // 20. Driver / Unauthorized Access Rejected
    // -------------------------------------------------------------------------
    console.log('\n20. Testing Unauthorized Access (Driver)...');
    const driverBoardAttempt = await makeRequest({
      method: 'GET',
      path: `/api/kitchen/board?date=${todayKolkataStr}`,
      headers: authHeaders(driverToken),
    });
    assert(driverBoardAttempt.status === 403, 'Driver access to kitchen board is rejected with 403 Forbidden');

    const unauthAttempt = await makeRequest({
      method: 'GET',
      path: `/api/kitchen/board?date=${todayKolkataStr}`,
    });
    assert(unauthAttempt.status === 401, 'Unauthenticated access is rejected with 401 Unauthorized');

    // -------------------------------------------------------------------------
    // 21. Server-Side Date Filtering
    // -------------------------------------------------------------------------
    console.log('\n21. Verifying Server-Side Date Filtering...');
    const futureDateRes = await makeRequest({
      method: 'GET',
      path: '/api/kitchen/board?date=2026-10-06',
      headers: authHeaders(kitchenToken),
    });
    assert(futureDateRes.status === 200, 'Querying 2026-10-06 succeeded');
    const futureOrders = new Set(futureDateRes.data.units.map((u: any) => u.orderNumber));
    assert(futureOrders.has('FK-2026-0002'), 'Future confirmed order FK-2026-0002 appears on 2026-10-06');
    assert(futureOrders.has('FK-2026-0007'), 'Future confirmed order FK-2026-0007 appears on 2026-10-06');
    assert(!futureOrders.has('FK-2026-K001'), "Today's order FK-2026-K001 does NOT appear on 2026-10-06");

    // -------------------------------------------------------------------------
    // 22. Station Filtering & Unassigned Station Support
    // -------------------------------------------------------------------------
    console.log('\n22. Verifying Station Filtering & Unassigned Handling...');
    const stationsRes = await makeRequest({
      method: 'GET',
      path: '/api/kitchen/stations',
      headers: authHeaders(kitchenToken),
    });
    assert(stationsRes.status === 200 && Array.isArray(stationsRes.data), 'GET /api/kitchen/stations returned active stations');

    // Query unassigned units
    const unassignedRes = await makeRequest({
      method: 'GET',
      path: `/api/kitchen/board?date=${todayKolkataStr}&stationId=unassigned`,
      headers: authHeaders(kitchenToken),
    });
    assert(unassignedRes.status === 200, 'Filtering by stationId=unassigned succeeded');
    for (const u of unassignedRes.data.units) {
      assert(u.stationId === null, `Filtered unit ${u.id} has stationId = null (Unassigned)`);
    }

    // -------------------------------------------------------------------------
    // 23. Data Scoping (No Sensitive PII / Billing Data Exposed)
    // -------------------------------------------------------------------------
    console.log('\n23. Verifying Data Scoping...');
    for (const u of boardRes.data.units) {
      assert(u.employee === undefined, 'No raw employee object exposed on board unit');
      assert(u.invoices === undefined, 'No invoice billing data exposed on board unit');
      assert(u.driver === undefined, 'No driver routing data exposed on board unit');
    }

    // Clean up temporary test orders
    await prisma.order.deleteMany({
      where: { orderNumber: { in: ['FK-TEST-DIRECT-FINISH', 'FK-TEST-OVERRIDE'] } },
    });

    console.log('\n====================================================');
    console.log('🎉 ALL 23 PHASE 7 VERIFICATION CHECKS PASSED');
    console.log('====================================================\n');
  } finally {
    await app!.close();
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  runLiveVerification().catch((err) => {
    console.error('Live verification failed:', err);
    process.exit(1);
  });
}
