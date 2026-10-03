import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import * as http from 'http';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { PrismaClient, DropStatus, OrderStatus, UserStatus } from '@prisma/client';

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
        port: 4002,
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

function authHeaders(token: string) {
  return { Authorization: `Bearer ${token}` };
}

async function runLiveVerification() {
  console.log('====================================================');
  console.log('PHASE 8 LIVE HTTP API VERIFICATION SUITE');
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
    await app.listen(4002);
    console.log('🚀 Test server started on http://localhost:4002/api\n');
  } catch (err) {
    console.error('Failed to start test server:', err);
    process.exit(1);
  }

  try {
    // -------------------------------------------------------------------------
    // 1-4. Authentication & Role Tokens
    // -------------------------------------------------------------------------
    console.log('1-4. Authenticating accounts...');

    async function login(email: string) {
      const res = await makeRequest({
        method: 'POST',
        path: '/api/auth/login',
        body: { email, password: 'Test@1234' },
      });
      assert(res.status === 200, `Login succeeded for ${email} (status: ${res.status})`);
      assert(!!res.data.accessToken, `Access token returned for ${email}`);
      return res.data.accessToken as string;
    }

    const adminToken = await login('admin@test.com');
    const dispatchToken = await login('dispatch@test.com');
    const driver1Token = await login('driver@test.com');
    const driver2Token = await login('driver2@test.com');
    const kitchenToken = await login('kitchen@test.com');

    const driver1User = await prisma.user.findUnique({ where: { email: 'driver@test.com' } });
    const driver2User = await prisma.user.findUnique({ where: { email: 'driver2@test.com' } });
    const kitchenUser = await prisma.user.findUnique({ where: { email: 'kitchen@test.com' } });

    assert(!!driver1User, 'driver@test.com user exists in DB');
    assert(!!driver2User, 'driver2@test.com user exists in DB');

    // Dynamic Kolkata today string
    const todayKolkataStr = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());

    // Reset test drops to initial seed state for repeatability
    const seedOrderD001 = await prisma.order.findUnique({ where: { orderNumber: 'FK-2026-D001' } });
    const seedOrderD004 = await prisma.order.findUnique({ where: { orderNumber: 'FK-2026-D004' } });
    if (seedOrderD001) {
      const drop1Link = await prisma.dropOrder.findUnique({ where: { orderId: seedOrderD001.id } });
      if (drop1Link) {
        await prisma.deliveryRecord.deleteMany({ where: { dropId: drop1Link.dropId } });
        await prisma.drop.update({
          where: { id: drop1Link.dropId },
          data: {
            status: DropStatus.DISPATCH_READY,
            outForDeliveryAt: null,
            deliveredAt: null,
            isOnTime: null,
          },
        });
        await prisma.order.updateMany({
          where: { orderNumber: { in: ['FK-2026-D001', 'FK-2026-D002'] } },
          data: { status: OrderStatus.CONFIRMED, deliveredAt: null },
        });
        const d001Orders = await prisma.order.findMany({
          where: { orderNumber: { in: ['FK-2026-D001', 'FK-2026-D002'] } },
          select: { id: true },
        });
        await prisma.orderEvent.deleteMany({
          where: {
            orderId: { in: d001Orders.map((o) => o.id) },
            type: { in: ['OUT_FOR_DELIVERY', 'DELIVERED'] },
          },
        });
      }
    }
    if (seedOrderD004) {
      const drop4Link = await prisma.dropOrder.findUnique({ where: { orderId: seedOrderD004.id } });
      if (drop4Link) {
        await prisma.drop.update({
          where: { id: drop4Link.dropId },
          data: {
            driverId: null,
            status: DropStatus.DISPATCH_READY,
            outForDeliveryAt: null,
            deliveredAt: null,
          },
        });
      }
    }

    // -------------------------------------------------------------------------
    // 5. Unauthorized Access Checks
    // -------------------------------------------------------------------------
    console.log('\n5. Verifying Unauthorized Access & Role Rejections...');
    const noAuthRes = await makeRequest({
      method: 'GET',
      path: '/api/dispatch/drops',
    });
    assert(noAuthRes.status === 401, 'Unauthenticated GET /api/dispatch/drops rejected with 401');

    const kitchenDispatchRes = await makeRequest({
      method: 'GET',
      path: '/api/dispatch/drops',
      headers: authHeaders(kitchenToken),
    });
    assert(kitchenDispatchRes.status === 403, 'Kitchen role forbidden from GET /api/dispatch/drops (403)');

    const kitchenDriverViewRes = await makeRequest({
      method: 'GET',
      path: '/api/dispatch/my-deliveries',
      headers: authHeaders(kitchenToken),
    });
    assert(kitchenDriverViewRes.status === 403, 'Kitchen role forbidden from GET /api/dispatch/my-deliveries (403)');

    // -------------------------------------------------------------------------
    // 6. Dispatch Board Inspection
    // -------------------------------------------------------------------------
    console.log('\n6. Inspecting Dispatch Board...');
    const boardRes = await makeRequest({
      method: 'GET',
      path: `/api/dispatch/drops?date=${todayKolkataStr}`,
      headers: authHeaders(dispatchToken),
    });
    assert(boardRes.status === 200, `GET /api/dispatch/drops returned 200`);
    assert(Array.isArray(boardRes.data.drops), 'Board returns array of drops');
    assert(typeof boardRes.data.summary === 'object', 'Board returns summary statistics');
    console.log(`  ✓ Board summary: total=${boardRes.data.summary.totalDrops}, dispatchReady=${boardRes.data.summary.dispatchReadyDrops}, outForDelivery=${boardRes.data.summary.outForDeliveryDrops}, delivered=${boardRes.data.summary.deliveredDrops}`);

    // -------------------------------------------------------------------------
    // 7-9. Drop Generation, Exact Grouping & Idempotency
    // -------------------------------------------------------------------------
    console.log('\n7-9. Verifying Drop Generation, Exact Grouping, and Idempotency...');
    const genRes = await makeRequest({
      method: 'POST',
      path: '/api/dispatch/drops/generate',
      headers: authHeaders(dispatchToken),
      body: { date: todayKolkataStr },
    });
    assert(genRes.status === 200, `POST /api/dispatch/drops/generate returned 200`);
    assert(typeof genRes.data.totalDrops === 'number', 'Generated drops count returned');

    // Run generation again to verify idempotency
    const genAgainRes = await makeRequest({
      method: 'POST',
      path: '/api/dispatch/drops/generate',
      headers: authHeaders(dispatchToken),
      body: { date: todayKolkataStr },
    });
    assert(genAgainRes.status === 200, 'Second drop generation succeeded idempotently');
    assert(genAgainRes.data.totalDrops === genRes.data.totalDrops, 'No duplicate drops created on second generation');

    // Fetch drops from board
    const dropsBoardRes = await makeRequest({
      method: 'GET',
      path: `/api/dispatch/drops?date=${todayKolkataStr}`,
      headers: authHeaders(dispatchToken),
    });
    assert(dropsBoardRes.status === 200, 'GET /api/dispatch/drops succeeded');
    const allDrops = dropsBoardRes.data.drops;

    // Rule 1: Multi-order drop: D001 and D002 must be in the exact same drop
    const dropWithD001 = allDrops.find((d: any) => d.orders.some((o: any) => o.orderNumber === 'FK-2026-D001'));
    assert(!!dropWithD001, 'Drop containing FK-2026-D001 found');
    const hasD002InSameDrop = dropWithD001.orders.some((o: any) => o.orderNumber === 'FK-2026-D002');
    assert(hasD002InSameDrop, 'FK-2026-D001 and FK-2026-D002 grouped into the EXACT SAME DROP (same company, address, time 700)');
    assert(dropWithD001.orders.length >= 2, 'Multi-order drop contains at least 2 orders');

    // Rule 2: Different time split: D003 (delivery time 840) must NOT be in D001 drop
    const hasD003InSameDrop = dropWithD001.orders.some((o: any) => o.orderNumber === 'FK-2026-D003');
    assert(!hasD003InSameDrop, 'FK-2026-D003 (time 840) is NOT grouped into D001 drop (time 700) - split by exact time');

    // Rule 3: Different company split: Summit (D004) and Verdant (D005) share Plot 12, but must be in DIFFERENT drops
    const dropD004 = allDrops.find((d: any) => d.orders.some((o: any) => o.orderNumber === 'FK-2026-D004'));
    const dropD005 = allDrops.find((d: any) => d.orders.some((o: any) => o.orderNumber === 'FK-2026-D005'));
    assert(!!dropD004, 'Drop containing Summit FK-2026-D004 found');
    assert(!!dropD005, 'Drop containing Verdant FK-2026-D005 found');
    assert(dropD004.id !== dropD005.id, 'Summit and Verdant drops are SEPARATE DROPS despite sharing physical address and time');

    // -------------------------------------------------------------------------
    // 10. Default Driver Behavior
    // -------------------------------------------------------------------------
    console.log('\n10. Verifying Default Driver Behavior...');
    // Apex drops have default driver configured (driver@test.com)
    assert(dropWithD001.driverId === driver1User!.id, `Apex drop correctly assigned company default driver (${driver1User!.email})`);

    // Summit drop has NO default driver configured (driverId is null)
    assert(dropD004.driverId === null, 'Summit drop has NO default driver and is correctly left UNASSIGNED (driverId=null)');

    // -------------------------------------------------------------------------
    // 11. Manual Driver Assignment & Capability Validation
    // -------------------------------------------------------------------------
    console.log('\n11. Verifying Manual Driver Assignment...');
    // Rejection: Cannot assign kitchen employee as driver
    const assignKitchenRes = await makeRequest({
      method: 'POST',
      path: `/api/dispatch/drops/${dropD004.id}/assign-driver`,
      headers: authHeaders(dispatchToken),
      body: { driverId: kitchenUser!.id },
    });
    assert(assignKitchenRes.status === 400, 'Assigning non-driver kitchen user rejected with 400 Bad Request');

    // Rejection: Driver cannot assign a driver to a drop
    const driverAssignRes = await makeRequest({
      method: 'POST',
      path: `/api/dispatch/drops/${dropD004.id}/assign-driver`,
      headers: authHeaders(driver1Token),
      body: { driverId: driver2User!.id },
    });
    assert(driverAssignRes.status === 403, 'Driver role forbidden from assigning drivers (403)');

    // Success: Dispatcher assigns driver2 to Summit drop
    const assignDriver2Res = await makeRequest({
      method: 'POST',
      path: `/api/dispatch/drops/${dropD004.id}/assign-driver`,
      headers: authHeaders(dispatchToken),
      body: { driverId: driver2User!.id },
    });
    assert(assignDriver2Res.status === 200, 'Dispatcher assigned driver2 to Summit drop (200)');
    assert(assignDriver2Res.data.driverId === driver2User!.id, 'Summit drop now has driverId = driver2.id');

    // -------------------------------------------------------------------------
    // 12-14. Out-for-Delivery & Lifecycle State Machine Invariants
    // -------------------------------------------------------------------------
    console.log('\n12-14. Verifying Out-for-Delivery & Lifecycle Invariants...');

    // Create an unassigned test drop directly in DB to verify out-for-delivery requires driver
    const unassignedTestDrop = await prisma.drop.create({
      data: {
        companyId: dropD004.companyId,
        deliveryDate: new Date('2026-10-15T00:00:00.000Z'),
        deliveryTimeMinutes: 720,
        addressKey: 'test-unassigned-addr',
        addressLine1Snapshot: 'Test Line 1',
        citySnapshot: 'Bangalore',
        stateSnapshot: 'Karnataka',
        postalCodeSnapshot: '560001',
        status: DropStatus.DISPATCH_READY,
        driverId: null,
      },
    });

    const outForDeliveryNoDriverRes = await makeRequest({
      method: 'POST',
      path: `/api/dispatch/drops/${unassignedTestDrop.id}/out-for-delivery`,
      headers: authHeaders(dispatchToken),
    });
    assert(outForDeliveryNoDriverRes.status === 400, 'Transition to OUT_FOR_DELIVERY rejected when drop has no driver (400)');

    // Clean up test drop
    await prisma.drop.delete({ where: { id: unassignedTestDrop.id } });

    // Transition Drop 1 (Apex multi-order) to OUT_FOR_DELIVERY
    const outForDeliveryRes = await makeRequest({
      method: 'POST',
      path: `/api/dispatch/drops/${dropWithD001.id}/out-for-delivery`,
      headers: authHeaders(dispatchToken),
    });
    assert(outForDeliveryRes.status === 200, 'Drop 1 transitioned to OUT_FOR_DELIVERY (200)');
    assert(outForDeliveryRes.data.status === 'OUT_FOR_DELIVERY', 'Status is OUT_FOR_DELIVERY');
    assert(!!outForDeliveryRes.data.outForDeliveryAt, 'outForDeliveryAt timestamp is set');

    // Repeated transition rejected
    const repeatedOutRes = await makeRequest({
      method: 'POST',
      path: `/api/dispatch/drops/${dropWithD001.id}/out-for-delivery`,
      headers: authHeaders(dispatchToken),
    });
    assert(repeatedOutRes.status === 409, 'Repeated OUT_FOR_DELIVERY rejected with 409 Conflict');

    // Invalid backward transition: cannot mark OUT_FOR_DELIVERY back to DISPATCH_READY
    const backwardsDispatchReadyRes = await makeRequest({
      method: 'POST',
      path: `/api/dispatch/drops/${dropWithD001.id}/dispatch-ready`,
      headers: authHeaders(dispatchToken),
    });
    assert(backwardsDispatchReadyRes.status === 400 || backwardsDispatchReadyRes.status === 409, 'Backwards transition OUT_FOR_DELIVERY -> DISPATCH_READY rejected with clear 4xx (400/409)');

    // -------------------------------------------------------------------------
    // 15-17. Driver Own-Deliveries View & Data Scoping
    // -------------------------------------------------------------------------
    console.log('\n15-17. Verifying Driver View & Strict Scoping...');

    // Driver 1 view
    const driver1DeliveriesRes = await makeRequest({
      method: 'GET',
      path: '/api/dispatch/my-deliveries',
      headers: authHeaders(driver1Token),
    });
    assert(driver1DeliveriesRes.status === 200, 'Driver 1 GET /api/dispatch/my-deliveries returned 200');
    assert(Array.isArray(driver1DeliveriesRes.data.drops), 'Returns array of driver drops');
    for (const d of driver1DeliveriesRes.data.drops) {
      assert(d.driverId === driver1User!.id, `Drop ${d.id} strictly belongs to Driver 1 (${driver1User!.id})`);
    }

    // Attempt parameter spoofing: Driver 1 passes ?driverId=<driver2.id>
    const spoofedDriverRes = await makeRequest({
      method: 'GET',
      path: `/api/dispatch/my-deliveries?driverId=${driver2User!.id}`,
      headers: authHeaders(driver1Token),
    });
    assert(spoofedDriverRes.status === 200, 'Spoofed query succeeded with 200');
    for (const d of spoofedDriverRes.data.drops) {
      assert(d.driverId === driver1User!.id, `Query spoofing IGNORED: returned drops belong only to authenticated Driver 1`);
    }

    // Driver 2 view
    const driver2DeliveriesRes = await makeRequest({
      method: 'GET',
      path: '/api/dispatch/my-deliveries',
      headers: authHeaders(driver2Token),
    });
    assert(driver2DeliveriesRes.status === 200, 'Driver 2 GET /api/dispatch/my-deliveries returned 200');
    for (const d of driver2DeliveriesRes.data.drops) {
      assert(d.driverId === driver2User!.id, `Drop ${d.id} strictly belongs to Driver 2`);
    }

    // Driver ordering: Delivery time ascending
    if (driver1DeliveriesRes.data.drops.length > 1) {
      for (let i = 0; i < driver1DeliveriesRes.data.drops.length - 1; i++) {
        const t1 = driver1DeliveriesRes.data.drops[i].deliveryTimeMinutes;
        const t2 = driver1DeliveriesRes.data.drops[i + 1].deliveryTimeMinutes;
        assert(t1 <= t2, `Driver deliveries ordered ascending by deliveryTimeMinutes (${t1} <= ${t2})`);
      }
    }

    // Cross-driver drop retrieval protection
    // Driver 2 tries to GET Drop 1 (assigned to Driver 1)
    const crossDriverGetRes = await makeRequest({
      method: 'GET',
      path: `/api/dispatch/drops/${dropWithD001.id}`,
      headers: authHeaders(driver2Token),
    });
    assert(crossDriverGetRes.status === 403, 'Driver 2 forbidden from accessing Driver 1 drop detail (403)');

    // -------------------------------------------------------------------------
    // 18-19. Marking Delivered & Cross-Driver Protection
    // -------------------------------------------------------------------------
    console.log('\n18-19. Verifying Delivered Workflow & Driver Ownership Enforcement...');

    // Driver 2 attempts to mark Drop 1 delivered (Drop 1 is assigned to Driver 1)
    const wrongDriverDeliveredRes = await makeRequest({
      method: 'POST',
      path: `/api/dispatch/drops/${dropWithD001.id}/delivered`,
      headers: authHeaders(driver2Token),
      body: {
        note: 'Malicious driver attempt',
      },
    });
    assert(wrongDriverDeliveredRes.status === 403, 'Driver 2 rejected with 403 when trying to mark Driver 1 drop delivered');

    // -------------------------------------------------------------------------
    // 20-22. Delivered Recording, Note, Photo & On-Time Tracking
    // -------------------------------------------------------------------------
    console.log('\n20-22. Verifying Delivery Note, Photo Reference & On-Time Recording...');

    const validPhotoUrl = 'https://s3.ap-south-1.amazonaws.com/fernleaf-proofs/drop-d001-pod.jpg';
    const deliveryNote = 'Left with building security desk as instructed. Contact signed: Guard Ramesh.';

    const markDeliveredRes = await makeRequest({
      method: 'POST',
      path: `/api/dispatch/drops/${dropWithD001.id}/delivered`,
      headers: authHeaders(driver1Token),
      body: {
        note: deliveryNote,
        photoUrl: validPhotoUrl,
      },
    });
    if (markDeliveredRes.status !== 200) {
      console.error('markDeliveredRes failed:', markDeliveredRes.status, markDeliveredRes.data);
    }
    assert(markDeliveredRes.status === 200, 'Assigned driver successfully marked Drop 1 DELIVERED (200)');
    assert(markDeliveredRes.data.status === 'DELIVERED', 'Drop status is DELIVERED');
    assert(!!markDeliveredRes.data.deliveredAt, 'deliveredAt timestamp is recorded');
    assert(markDeliveredRes.data.deliveryRecord?.note === deliveryNote, 'Delivery note correctly recorded in deliveryRecord');
    assert(markDeliveredRes.data.deliveryRecord?.photoUrl === validPhotoUrl, 'Photo URL reference correctly recorded');
    assert(typeof markDeliveredRes.data.isOnTime === 'boolean', 'isOnTime deterministic calculation returned boolean');

    // -------------------------------------------------------------------------
    // 23. Repeated Delivery Attempt (Idempotency / State Invariant)
    // -------------------------------------------------------------------------
    console.log('\n23. Verifying Repeated Delivery Rejection...');
    const repeatDeliveredRes = await makeRequest({
      method: 'POST',
      path: `/api/dispatch/drops/${dropWithD001.id}/delivered`,
      headers: authHeaders(driver1Token),
      body: {
        note: 'Duplicate delivery request',
      },
    });
    assert(repeatDeliveredRes.status === 409, 'Repeated delivery attempt rejected with 409 Conflict');

    // -------------------------------------------------------------------------
    // 24. Multi-Order Drop Consistency
    // -------------------------------------------------------------------------
    console.log('\n24. Verifying Multi-Order Drop State Propagation...');
    const orderD001Db = await prisma.order.findUnique({ where: { orderNumber: 'FK-2026-D001' } });
    const orderD002Db = await prisma.order.findUnique({ where: { orderNumber: 'FK-2026-D002' } });
    assert(orderD001Db?.status === OrderStatus.DELIVERED, 'Contained order FK-2026-D001 transitioned to DELIVERED');
    assert(orderD002Db?.status === OrderStatus.DELIVERED, 'Contained order FK-2026-D002 transitioned to DELIVERED');
    assert(!!orderD001Db?.deliveredAt, 'Contained order FK-2026-D001 has deliveredAt timestamp');
    assert(!!orderD002Db?.deliveredAt, 'Contained order FK-2026-D002 has deliveredAt timestamp');

    // -------------------------------------------------------------------------
    // 25. Order Delivery Details Change & Re-grouping Reconcile
    // -------------------------------------------------------------------------
    console.log('\n25. Verifying Delivery Detail Changes & Drop Reconciliation...');
    // Create a temporary order for Apex at 900 minutes
    const existingDelivery = await prisma.orderDelivery.findUnique({
      where: { orderId: orderD001Db!.id },
    });
    const oldTestOrder = await prisma.order.findUnique({ where: { orderNumber: 'FK-TEST-RECONCILE' } });
    if (oldTestOrder) {
      await prisma.dropOrder.deleteMany({ where: { orderId: oldTestOrder.id } });
      await prisma.orderDelivery.deleteMany({ where: { orderId: oldTestOrder.id } });
      await prisma.orderEvent.deleteMany({ where: { orderId: oldTestOrder.id } });
      await prisma.order.delete({ where: { id: oldTestOrder.id } });
    }
    const testReconcileOrder = await prisma.order.create({
      data: {
        orderNumber: 'FK-TEST-RECONCILE',
        employeeId: orderD001Db!.employeeId,
        companyId: orderD001Db!.companyId,
        deliveryDate: orderD001Db!.deliveryDate,
        deliveryTimeMinutes: 900,
        packagingTypeId: orderD001Db!.packagingTypeId,
        status: OrderStatus.CONFIRMED,
        totalCents: 500,
        delivery: {
          create: {
            companyAddressId: existingDelivery!.companyAddressId,
            addressLabelSnapshot: existingDelivery!.addressLabelSnapshot,
            addressLine1Snapshot: existingDelivery!.addressLine1Snapshot,
            addressLine2Snapshot: existingDelivery!.addressLine2Snapshot,
            citySnapshot: existingDelivery!.citySnapshot,
            stateSnapshot: existingDelivery!.stateSnapshot,
            postalCodeSnapshot: existingDelivery!.postalCodeSnapshot,
            deliveryTimeMinutes: 900,
            packagingNameSnapshot: 'Eco Box',
          },
        },
      },
    });

    // Generate drop for it
    await makeRequest({
      method: 'POST',
      path: '/api/dispatch/drops/generate',
      headers: authHeaders(dispatchToken),
      body: { date: todayKolkataStr },
    });

    // Verify order has a drop
    const dropBefore = await prisma.dropOrder.findUnique({
      where: { orderId: testReconcileOrder.id },
      include: { drop: true },
    });
    assert(!!dropBefore, 'Test order assigned to initial drop at 900 minutes');
    assert(dropBefore!.drop.deliveryTimeMinutes === 900, 'Initial drop has deliveryTimeMinutes = 900');

    // Admin overrides delivery time to 960 minutes
    const overrideRes = await makeRequest({
      method: 'POST',
      path: `/api/orders/${testReconcileOrder.id}/override`,
      headers: authHeaders(adminToken),
      body: {
        deliveryTimeMinutes: 960,
        note: 'Client requested postponement to 16:00',
      },
    });
    if (overrideRes.status !== 200) {
      console.error('overrideRes failed:', overrideRes.status, overrideRes.data);
    }
    assert(overrideRes.status === 200, 'Admin override succeeded (200)');

    // Verify drop association was reconciled to the new delivery time
    const dropAfter = await prisma.dropOrder.findUnique({
      where: { orderId: testReconcileOrder.id },
      include: { drop: true },
    });
    assert(!!dropAfter, 'Test order re-associated with reconciled drop');
    assert(dropAfter!.drop.deliveryTimeMinutes === 960, 'Reconciled drop now reflects updated deliveryTimeMinutes = 960');

    // Clean up temporary order and its drops
    await prisma.dropOrder.deleteMany({ where: { orderId: testReconcileOrder.id } });
    await prisma.orderDelivery.deleteMany({ where: { orderId: testReconcileOrder.id } });
    await prisma.orderEvent.deleteMany({ where: { orderId: testReconcileOrder.id } });
    await prisma.order.delete({ where: { id: testReconcileOrder.id } });
    await prisma.drop.deleteMany({
      where: {
        orders: { none: {} },
        deliveryTimeMinutes: { in: [900, 960] },
      },
    });

    // -------------------------------------------------------------------------
    // 26. Database State Verification
    // -------------------------------------------------------------------------
    console.log('\n26. Verifying Direct PostgreSQL Database State...');
    const drop1Db = await prisma.drop.findUnique({
      where: { id: dropWithD001.id },
      include: {
        orders: true,
        deliveryRecord: true,
      },
    });
    assert(drop1Db?.status === DropStatus.DELIVERED, 'DB Drop 1 status is DELIVERED');
    assert(!!drop1Db?.deliveryRecord, 'DB Drop 1 has DeliveryRecord record');
    assert(drop1Db?.deliveryRecord?.note === deliveryNote, 'DB deliveryRecord.note matches exactly');
    assert(drop1Db?.deliveryRecord?.photoUrl === validPhotoUrl, 'DB deliveryRecord.photoUrl matches exactly');
    assert(drop1Db?.orders.length >= 2, 'DB Drop 1 has multiple DropOrder links');

    const deliveredEvents = await prisma.orderEvent.findMany({
      where: {
        orderId: { in: [orderD001Db!.id, orderD002Db!.id] },
        type: 'DELIVERED',
      },
    });
    assert(deliveredEvents.length >= 2, 'Both contained orders have DELIVERED OrderEvents in DB');
    const ordersWithDeliveredEvent = new Set(deliveredEvents.map((e) => e.orderId));
    assert(ordersWithDeliveredEvent.has(orderD001Db!.id), 'FK-2026-D001 has DELIVERED OrderEvent');
    assert(ordersWithDeliveredEvent.has(orderD002Db!.id), 'FK-2026-D002 has DELIVERED OrderEvent');

    console.log('\n====================================================');
    console.log('🎉 ALL 26 PHASE 8 VERIFICATION CHECKS PASSED');
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
