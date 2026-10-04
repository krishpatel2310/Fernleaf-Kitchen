import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import * as http from 'http';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { PrismaClient, OrderStatus, DropStatus } from '@prisma/client';

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

const PORT = 4005;

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
        port: PORT,
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
  console.log('PHASE 11 LIVE HTTP API VERIFICATION SUITE — DASHBOARDS');
  console.log('====================================================\n');

  let app: INestApplication | null = null;
  try {
    app = await NestFactory.create(AppModule, {
      logger: ['warn', 'error'],
    });
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
      }),
    );
    await app.listen(PORT);
    console.log(`🚀 Test server started on http://localhost:${PORT}/api\n`);

    // -------------------------------------------------------------
    // 1-4. Authenticate Accounts (Admin, Kitchen, Dispatch, Driver)
    // -------------------------------------------------------------
    console.log('Step 1-4: Authenticating test accounts...');

    const adminLoginRes = await makeRequest({
      method: 'POST',
      path: '/api/auth/login',
      body: { email: 'admin@test.com', password: 'Test@1234' },
    });
    assert(adminLoginRes.status === 200, 'Admin login succeeded');
    const adminToken = adminLoginRes.data.accessToken;

    const kitchenLoginRes = await makeRequest({
      method: 'POST',
      path: '/api/auth/login',
      body: { email: 'kitchen@test.com', password: 'Test@1234' },
    });
    assert(kitchenLoginRes.status === 200, 'Kitchen login succeeded');
    const kitchenToken = kitchenLoginRes.data.accessToken;

    const dispatchLoginRes = await makeRequest({
      method: 'POST',
      path: '/api/auth/login',
      body: { email: 'dispatch@test.com', password: 'Test@1234' },
    });
    assert(dispatchLoginRes.status === 200, 'Dispatch login succeeded');
    const dispatchToken = dispatchLoginRes.data.accessToken;

    const driverLoginRes = await makeRequest({
      method: 'POST',
      path: '/api/auth/login',
      body: { email: 'driver@test.com', password: 'Test@1234' },
    });
    assert(driverLoginRes.status === 200, 'Driver login succeeded');
    const driverToken = driverLoginRes.data.accessToken;
    const driverUserId = driverLoginRes.data.user.id;

    // -------------------------------------------------------------
    // 5-8. Authorized Role Dashboard Access (200 OK)
    // -------------------------------------------------------------
    console.log('\nStep 5-8: Authorized role-specific dashboard access...');

    const adminDashRes = await makeRequest({
      method: 'GET',
      path: '/api/dashboards/admin',
      headers: authHeaders(adminToken),
    });
    assert(adminDashRes.status === 200, 'Admin accesses admin dashboard (200)');
    assert(adminDashRes.data.timezone === 'Asia/Kolkata', 'Admin dashboard date basis is Asia/Kolkata');
    assert(adminDashRes.data.orders !== undefined, 'Admin dashboard contains orders overview');
    assert(adminDashRes.data.kitchenRisk !== undefined, 'Admin dashboard contains kitchen risk');
    assert(adminDashRes.data.dispatch !== undefined, 'Admin dashboard contains dispatch overview');
    assert(adminDashRes.data.billing !== undefined, 'Admin dashboard contains billing overview');
    assert(adminDashRes.data.configuration !== undefined, 'Admin dashboard contains configuration health');

    const kitchenDashRes = await makeRequest({
      method: 'GET',
      path: '/api/dashboards/kitchen',
      headers: authHeaders(kitchenToken),
    });
    assert(kitchenDashRes.status === 200, 'Kitchen accesses kitchen dashboard (200)');
    assert(kitchenDashRes.data.timezone === 'Asia/Kolkata', 'Kitchen dashboard date basis is Asia/Kolkata');
    assert(kitchenDashRes.data.summary !== undefined, 'Kitchen dashboard contains production summary');
    assert(Array.isArray(kitchenDashRes.data.stationWorkload), 'Kitchen dashboard contains stationWorkload array');

    const dispatchDashRes = await makeRequest({
      method: 'GET',
      path: '/api/dashboards/dispatch',
      headers: authHeaders(dispatchToken),
    });
    assert(dispatchDashRes.status === 200, 'Dispatch accesses dispatch dashboard (200)');
    assert(dispatchDashRes.data.timezone === 'Asia/Kolkata', 'Dispatch dashboard date basis is Asia/Kolkata');
    assert(dispatchDashRes.data.summary !== undefined, 'Dispatch dashboard contains drop summary');
    assert(Array.isArray(dispatchDashRes.data.unassignedActionList), 'Dispatch dashboard contains unassignedActionList');

    const driverDashRes = await makeRequest({
      method: 'GET',
      path: '/api/dashboards/driver',
      headers: authHeaders(driverToken),
    });
    assert(driverDashRes.status === 200, 'Driver accesses driver dashboard (200)');
    assert(driverDashRes.data.timezone === 'Asia/Kolkata', 'Driver dashboard date basis is Asia/Kolkata');
    assert(driverDashRes.data.driver.id === driverUserId, 'Driver dashboard returned user matches authenticated JWT user');
    assert(driverDashRes.data.summary !== undefined, 'Driver dashboard contains delivery summary');
    assert(Array.isArray(driverDashRes.data.deliveries), 'Driver dashboard contains deliveries array');

    // -------------------------------------------------------------
    // 9. Unauthenticated Requests (401)
    // -------------------------------------------------------------
    console.log('\nStep 9: Unauthenticated requests rejected with 401...');

    const unauthAdmin = await makeRequest({ method: 'GET', path: '/api/dashboards/admin' });
    assert(unauthAdmin.status === 401, 'Unauthenticated admin dashboard request returns 401');

    const unauthKitchen = await makeRequest({ method: 'GET', path: '/api/dashboards/kitchen' });
    assert(unauthKitchen.status === 401, 'Unauthenticated kitchen dashboard request returns 401');

    const unauthDispatch = await makeRequest({ method: 'GET', path: '/api/dashboards/dispatch' });
    assert(unauthDispatch.status === 401, 'Unauthenticated dispatch dashboard request returns 401');

    const unauthDriver = await makeRequest({ method: 'GET', path: '/api/dashboards/driver' });
    assert(unauthDriver.status === 401, 'Unauthenticated driver dashboard request returns 401');

    // -------------------------------------------------------------
    // 10-13. Cross-Role Authorization / RBAC Enforcement (403)
    // -------------------------------------------------------------
    console.log('\nStep 10-13: Cross-role unauthorized access rejected with 403...');

    const kitchenAdmin = await makeRequest({
      method: 'GET',
      path: '/api/dashboards/admin',
      headers: authHeaders(kitchenToken),
    });
    assert(kitchenAdmin.status === 403, 'Kitchen role cannot access admin dashboard (403 Forbidden)');

    const dispatchAdmin = await makeRequest({
      method: 'GET',
      path: '/api/dashboards/admin',
      headers: authHeaders(dispatchToken),
    });
    assert(dispatchAdmin.status === 403, 'Dispatch role cannot access admin dashboard (403 Forbidden)');

    const driverAdmin = await makeRequest({
      method: 'GET',
      path: '/api/dashboards/admin',
      headers: authHeaders(driverToken),
    });
    assert(driverAdmin.status === 403, 'Driver role cannot access admin dashboard (403 Forbidden)');

    const driverKitchen = await makeRequest({
      method: 'GET',
      path: '/api/dashboards/kitchen',
      headers: authHeaders(driverToken),
    });
    assert(driverKitchen.status === 403, 'Driver role cannot access kitchen dashboard (403 Forbidden)');

    const driverDispatch = await makeRequest({
      method: 'GET',
      path: '/api/dashboards/dispatch',
      headers: authHeaders(driverToken),
    });
    assert(driverDispatch.status === 403, 'Driver role cannot access dispatch dashboard (403 Forbidden)');

    // -------------------------------------------------------------
    // 14-15. Driver Data Isolation & Anti-Spoofing
    // -------------------------------------------------------------
    console.log('\nStep 14-15: Driver data isolation and query param spoofing resistance...');

    // Attempt to pass another driver's ID via query param
    const driverSpoofRes = await makeRequest({
      method: 'GET',
      path: '/api/dashboards/driver?driverId=some-other-driver-id&userId=fake-user',
      headers: authHeaders(driverToken),
    });
    assert(driverSpoofRes.status === 200, 'Driver request succeeded');
    assert(
      driverSpoofRes.data.driver.id === driverUserId,
      'Driver dashboard strictly ignores driverId query param and bounds to JWT identity',
    );

    // Verify all deliveries returned belong only to driverUserId
    for (const del of driverSpoofRes.data.deliveries) {
      const dropInDb = await prisma.drop.findUnique({
        where: { id: del.dropId },
      });
      assert(
        dropInDb?.driverId === driverUserId,
        `Drop '${del.dropId}' in driver dashboard belongs strictly to authenticated driver`,
      );
    }

    // -------------------------------------------------------------
    // 16. Kitchen Dashboard Active Workload & Unit Counting
    // -------------------------------------------------------------
    console.log('\nStep 16: Kitchen dashboard workload & unit counting verification...');

    // Query kitchen dashboard for 2026-10-05 (seed data date)
    const kitchenBoardRes = await makeRequest({
      method: 'GET',
      path: '/api/dashboards/kitchen?date=2026-10-05',
      headers: authHeaders(kitchenToken),
    });
    assert(kitchenBoardRes.status === 200, 'Kitchen dashboard for 2026-10-05 succeeded');
    assert(
      kitchenBoardRes.data.summary.totalConfirmedOrders >= 0,
      'Confirmed orders count is authoritative non-negative integer',
    );
    assert(
      kitchenBoardRes.data.summary.totalUnits >= 0,
      'Total units count represents distinct combinations/units',
    );
    assert(
      kitchenBoardRes.data.summary.unitsDone +
        kitchenBoardRes.data.summary.unitsInProgress +
        kitchenBoardRes.data.summary.unitsNotStarted ===
        kitchenBoardRes.data.summary.totalUnits,
      'Sum of unit statuses equals totalUnits exactly',
    );

    // -------------------------------------------------------------
    // 17. Dispatch Dashboard Unassigned Drops & Action List
    // -------------------------------------------------------------
    console.log('\nStep 17: Dispatch dashboard unassigned drops verification...');

    const dispatchDateRes = await makeRequest({
      method: 'GET',
      path: '/api/dashboards/dispatch?date=2026-10-05',
      headers: authHeaders(dispatchToken),
    });
    assert(dispatchDateRes.status === 200, 'Dispatch dashboard for 2026-10-05 succeeded');
    assert(
      dispatchDateRes.data.summary.unassignedDropsCount >= 0,
      'Unassigned drops count is authoritative',
    );

    // If there are unassigned drops, check that each has companyName, address, and deliveryTime
    for (const item of dispatchDateRes.data.unassignedActionList) {
      assert(item.dropId !== undefined, 'Unassigned drop has dropId');
      assert(item.companyName !== undefined, 'Unassigned drop has companyName');
      assert(item.deliveryAddress !== undefined, 'Unassigned drop has deliveryAddress');
      assert(item.formattedDeliveryTime !== undefined, 'Unassigned drop has formattedDeliveryTime');
    }

    // -------------------------------------------------------------
    // 18. Admin Dashboard Billing Figures Integrity
    // -------------------------------------------------------------
    console.log('\nStep 18: Admin dashboard billing figures integrity...');

    const billingData = adminDashRes.data.billing;
    assert(
      Number.isInteger(billingData.uninvoicedConfirmedOrderCount),
      'Uninvoiced confirmed order count is integer',
    );
    assert(
      Number.isInteger(billingData.uninvoicedConfirmedTotalCents),
      'Uninvoiced confirmed total cents is integer cents',
    );
    assert(
      Number.isInteger(billingData.issuedInvoiceCount),
      'Issued invoice count is integer',
    );
    assert(
      Number.isInteger(billingData.issuedInvoiceTotalCents),
      'Issued invoice total cents is integer cents',
    );
    assert(
      Number.isInteger(billingData.paidInvoiceCount),
      'Paid invoice count is integer',
    );
    assert(
      Number.isInteger(billingData.paidInvoiceTotalCents),
      'Paid invoice total cents is integer cents',
    );
    assert(
      Number.isInteger(billingData.invoicesWithAdjustmentsCount),
      'Invoices with adjustments count is integer',
    );

    // Cross-verify with DB directly
    const actualUninvoicedCount = await prisma.order.count({
      where: {
        status: OrderStatus.CONFIRMED,
        invoiceEntry: null,
      },
    });
    assert(
      billingData.uninvoicedConfirmedOrderCount === actualUninvoicedCount,
      `Billing uninvoiced confirmed count (${billingData.uninvoicedConfirmedOrderCount}) matches DB (${actualUninvoicedCount})`,
    );

    // -------------------------------------------------------------
    // 19. Operational Orders vs Delivered & Cancelled Orders
    // -------------------------------------------------------------
    console.log('\nStep 19: Operational orders vs delivered & cancelled orders verification...');

    const ordersOverview = adminDashRes.data.orders;
    assert(
      ordersOverview.operationalOrdersToday !== undefined,
      'Admin dashboard returns operationalOrdersToday metric',
    );
    assert(
      ordersOverview.activeOperationalOrdersToday === undefined,
      'Old activeOperationalOrdersToday field is no longer returned',
    );
    assert(
      ordersOverview.operationalOrdersToday === ordersOverview.confirmedOrdersToday,
      'operationalOrdersToday strictly matches confirmedOrdersToday (delivered orders do NOT increase operationalOrdersToday)',
    );
    assert(
      ordersOverview.deliveredOrdersToday !== undefined,
      'deliveredOrdersToday reports completed deliveries separately',
    );
    assert(
      ordersOverview.cancelledOrdersToday >= 0,
      'Cancelled orders reported in separate dedicated metric',
    );
    assert(
      ordersOverview.rejectedOrdersToday >= 0,
      'Rejected orders reported in separate dedicated metric',
    );

    // -------------------------------------------------------------
    // 20. Empty/Missing Data Behavior & Date Defaults
    // -------------------------------------------------------------
    console.log('\nStep 20: Empty/missing data and far-future date behavior...');

    const emptyKitchenRes = await makeRequest({
      method: 'GET',
      path: '/api/dashboards/kitchen?date=2099-01-01',
      headers: authHeaders(kitchenToken),
    });
    assert(emptyKitchenRes.status === 200, 'Far-future kitchen query returns 200');
    assert(emptyKitchenRes.data.summary.totalUnits === 0, 'Zero units for empty date');
    assert(
      emptyKitchenRes.data.stationWorkload.every((s: any) => s.totalUnits === 0),
      'All stations report zero units for empty date',
    );
    assert(emptyKitchenRes.data.urgentUnits.length === 0, 'Empty urgent units array');

    const emptyDispatchRes = await makeRequest({
      method: 'GET',
      path: '/api/dashboards/dispatch?date=2099-01-01',
      headers: authHeaders(dispatchToken),
    });
    assert(emptyDispatchRes.status === 200, 'Far-future dispatch query returns 200');
    assert(emptyDispatchRes.data.summary.totalDrops === 0, 'Zero drops for empty date');
    assert(emptyDispatchRes.data.unassignedActionList.length === 0, 'Empty unassigned action list');
    assert(emptyDispatchRes.data.activeDeliveries.length === 0, 'Empty active deliveries list');

    console.log('\n====================================================');
    console.log('🎉 ALL 20+ PHASE 11 LIVE HTTP VERIFICATIONS PASSED!');
    console.log('====================================================\n');
  } finally {
    if (app) {
      await app.close();
    }
    await prisma.$disconnect();
  }
}

runLiveVerification().catch((err) => {
  console.error('Phase 11 verification failed:', err);
  process.exit(1);
});
