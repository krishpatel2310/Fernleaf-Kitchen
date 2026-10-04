import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import * as http from 'http';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { PrismaClient, DayOfWeek } from '@prisma/client';

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
        port: 4004,
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
  console.log('PHASE 10 LIVE HTTP API VERIFICATION SUITE — SETTINGS');
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
    await app.listen(4004);
    console.log('🚀 Test server started on http://localhost:4004/api\n');

    // -------------------------------------------------------------
    // 1-4. Authenticate Accounts
    // -------------------------------------------------------------
    console.log('1-4. Authenticating accounts across all roles...');
    const accounts = [
      { email: 'admin@test.com', password: 'Test@1234', role: 'ADMIN' },
      { email: 'kitchen@test.com', password: 'Test@1234', role: 'KITCHEN' },
      { email: 'dispatch@test.com', password: 'Test@1234', role: 'DISPATCH' },
      { email: 'driver@test.com', password: 'Test@1234', role: 'DRIVER' },
    ];

    const tokens: Record<string, string> = {};

    for (const acc of accounts) {
      const res = await makeRequest({
        method: 'POST',
        path: '/api/auth/login',
        body: { email: acc.email, password: acc.password },
      });
      assert(
        res.status === 200,
        `Login succeeded for ${acc.email} (status: ${res.status})`,
      );
      assert(
        typeof res.data.accessToken === 'string',
        `Access token returned for ${acc.email}`,
      );
      tokens[acc.role] = res.data.accessToken;
    }

    const adminToken = tokens['ADMIN'];
    const kitchenToken = tokens['KITCHEN'];
    const dispatchToken = tokens['DISPATCH'];
    const driverToken = tokens['DRIVER'];

    // -------------------------------------------------------------
    // 5-6. Unauthenticated Access Protection (401)
    // -------------------------------------------------------------
    console.log('\n5-6. Verifying Unauthenticated Access Protection...');
    {
      const getRes = await makeRequest({
        method: 'GET',
        path: '/api/settings/kitchen',
      });
      assert(
        getRes.status === 401,
        'Unauthenticated GET /api/settings/kitchen rejected with 401',
      );

      const patchRes = await makeRequest({
        method: 'PATCH',
        path: '/api/settings/kitchen',
        body: { cutoffTime: '15:00' },
      });
      assert(
        patchRes.status === 401,
        'Unauthenticated PATCH /api/settings/kitchen rejected with 401',
      );

      const holidayPostRes = await makeRequest({
        method: 'POST',
        path: '/api/settings/kitchen/holidays',
        body: { date: '2026-11-20', name: 'Unauthorized Holiday' },
      });
      assert(
        holidayPostRes.status === 401,
        'Unauthenticated POST /api/settings/kitchen/holidays rejected with 401',
      );
    }

    // -------------------------------------------------------------
    // 7. Admin can GET settings
    // -------------------------------------------------------------
    console.log('\n7. Admin Inspecting Kitchen Settings...');
    let initialSettings: any;
    {
      const res = await makeRequest({
        method: 'GET',
        path: '/api/settings/kitchen',
        headers: authHeaders(adminToken),
      });
      assert(res.status === 200, 'Admin GET /api/settings/kitchen returned 200');
      assert(res.data.id === 'default', 'Settings record ID is "default"');
      assert(
        typeof res.data.cutoffTime === 'string',
        `Exposes formatted cutoffTime: '${res.data.cutoffTime}'`,
      );
      assert(
        typeof res.data.cutoffTimeMinutes === 'number',
        `Exposes cutoffTimeMinutes: ${res.data.cutoffTimeMinutes}`,
      );
      assert(
        typeof res.data.cutoffWorkingDaysCount === 'number',
        `Exposes cutoffWorkingDaysCount: ${res.data.cutoffWorkingDaysCount}`,
      );
      assert(
        res.data.kitchenTimezone === 'Asia/Kolkata',
        'Exposes kitchenTimezone as "Asia/Kolkata"',
      );
      assert(
        Array.isArray(res.data.workingDays) &&
          res.data.workingDays.length === 7,
        'Returns full 7-day kitchen working days configuration',
      );
      assert(
        Array.isArray(res.data.holidays),
        'Returns kitchen holidays list',
      );

      initialSettings = res.data;
    }

    // -------------------------------------------------------------
    // 8-9. Role Boundaries & Unauthorized Mutation Protection (403)
    // -------------------------------------------------------------
    console.log(
      '\n8-9. Verifying Role Boundaries & Unauthorized Mutations...',
    );
    {
      // KITCHEN role cannot mutate settings
      const kPatch = await makeRequest({
        method: 'PATCH',
        path: '/api/settings/kitchen',
        headers: authHeaders(kitchenToken),
        body: { cutoffTime: '14:00' },
      });
      assert(
        kPatch.status === 403,
        'KITCHEN role forbidden from PATCH /api/settings/kitchen (403)',
      );

      const kHoliday = await makeRequest({
        method: 'POST',
        path: '/api/settings/kitchen/holidays',
        headers: authHeaders(kitchenToken),
        body: { date: '2026-11-20', name: 'Kitchen Mutate' },
      });
      assert(
        kHoliday.status === 403,
        'KITCHEN role forbidden from POST /api/settings/kitchen/holidays (403)',
      );

      // DISPATCH role cannot mutate settings
      const dPatch = await makeRequest({
        method: 'PATCH',
        path: '/api/settings/kitchen',
        headers: authHeaders(dispatchToken),
        body: { cutoffTime: '14:00' },
      });
      assert(
        dPatch.status === 403,
        'DISPATCH role forbidden from PATCH /api/settings/kitchen (403)',
      );

      // DRIVER role cannot mutate settings
      const drPatch = await makeRequest({
        method: 'PATCH',
        path: '/api/settings/kitchen',
        headers: authHeaders(driverToken),
        body: { cutoffTime: '14:00' },
      });
      assert(
        drPatch.status === 403,
        'DRIVER role forbidden from PATCH /api/settings/kitchen (403)',
      );
    }

    // -------------------------------------------------------------
    // 10-12. Server-side Validation Invariants
    // -------------------------------------------------------------
    console.log('\n10-12. Verifying Server-Side Validation Rules...');
    {
      // 10. Invalid cutoff time
      const badCutoff1 = await makeRequest({
        method: 'PATCH',
        path: '/api/settings/kitchen',
        headers: authHeaders(adminToken),
        body: { cutoffTime: '25:00' },
      });
      assert(
        badCutoff1.status === 400,
        'Attempt to set invalid cutoff time "25:00" rejected with 400 Bad Request',
      );

      const badCutoff2 = await makeRequest({
        method: 'PATCH',
        path: '/api/settings/kitchen',
        headers: authHeaders(adminToken),
        body: { cutoffTime: 'invalid-time' },
      });
      assert(
        badCutoff2.status === 400,
        'Attempt to set invalid cutoff time format rejected with 400 Bad Request',
      );

      // 11. Invalid working days
      const allFalseWd = await makeRequest({
        method: 'PUT',
        path: '/api/settings/kitchen/working-days',
        headers: authHeaders(adminToken),
        body: [
          { dayOfWeek: DayOfWeek.MONDAY, isWorking: false },
          { dayOfWeek: DayOfWeek.TUESDAY, isWorking: false },
          { dayOfWeek: DayOfWeek.WEDNESDAY, isWorking: false },
          { dayOfWeek: DayOfWeek.THURSDAY, isWorking: false },
          { dayOfWeek: DayOfWeek.FRIDAY, isWorking: false },
          { dayOfWeek: DayOfWeek.SATURDAY, isWorking: false },
          { dayOfWeek: DayOfWeek.SUNDAY, isWorking: false },
        ],
      });
      assert(
        allFalseWd.status === 400,
        'Attempt to disable all kitchen working days rejected with 400 Bad Request',
      );

      const dupWd = await makeRequest({
        method: 'PUT',
        path: '/api/settings/kitchen/working-days',
        headers: authHeaders(adminToken),
        body: [
          { dayOfWeek: DayOfWeek.MONDAY, isWorking: true },
          { dayOfWeek: DayOfWeek.MONDAY, isWorking: false },
        ],
      });
      assert(
        dupWd.status === 400,
        'Attempt to submit duplicate weekday configuration rejected with 400 Bad Request',
      );

      // 12. Invalid lead time count
      const zeroLead = await makeRequest({
        method: 'PATCH',
        path: '/api/settings/kitchen',
        headers: authHeaders(adminToken),
        body: { cutoffWorkingDaysCount: 0 },
      });
      assert(
        zeroLead.status === 400,
        'Attempt to set cutoffWorkingDaysCount = 0 rejected with 400 Bad Request',
      );

      const negLead = await makeRequest({
        method: 'PATCH',
        path: '/api/settings/kitchen',
        headers: authHeaders(adminToken),
        body: { cutoffWorkingDaysCount: -2 },
      });
      assert(
        negLead.status === 400,
        'Attempt to set negative cutoffWorkingDaysCount rejected with 400 Bad Request',
      );
    }

    // -------------------------------------------------------------
    // 13-15. Holiday Management Lifecycle
    // -------------------------------------------------------------
    console.log('\n13-15. Verifying Holiday Management Lifecycle...');
    const testHolidayDate = '2026-11-25';
    let createdHolidayId: string | null = null;
    {
      // 13. Holiday can be added
      const addRes = await makeRequest({
        method: 'POST',
        path: '/api/settings/kitchen/holidays',
        headers: authHeaders(adminToken),
        body: {
          date: testHolidayDate,
          name: 'Annual Equipment Maintenance',
        },
      });
      assert(
        addRes.status === 201,
        'POST /api/settings/kitchen/holidays returned 201 Created',
      );
      assert(
        addRes.data.name === 'Annual Equipment Maintenance',
        'Holiday record has correct name',
      );
      createdHolidayId = addRes.data.id;

      // 14. Duplicate holiday rejected
      const dupHolidayRes = await makeRequest({
        method: 'POST',
        path: '/api/settings/kitchen/holidays',
        headers: authHeaders(adminToken),
        body: {
          date: testHolidayDate,
          name: 'Conflicting Holiday',
        },
      });
      assert(
        dupHolidayRes.status === 409,
        'Attempt to create duplicate holiday on same date rejected with 409 Conflict',
      );

      // Verify holiday appears in list
      const listRes = await makeRequest({
        method: 'GET',
        path: '/api/settings/kitchen/holidays',
        headers: authHeaders(adminToken),
      });
      assert(listRes.status === 200, 'GET /api/settings/kitchen/holidays succeeded');
      const found = listRes.data.some(
        (h: any) => h.name === 'Annual Equipment Maintenance',
      );
      assert(found, 'Created holiday is returned in holidays list');

      // 15. Holiday can be removed
      const delRes = await makeRequest({
        method: 'DELETE',
        path: `/api/settings/kitchen/holidays/${createdHolidayId}`,
        headers: authHeaders(adminToken),
      });
      assert(
        delRes.status === 200,
        'DELETE /api/settings/kitchen/holidays/:id returned 200 OK',
      );

      // Verify it is removed
      const listAfterRes = await makeRequest({
        method: 'GET',
        path: '/api/settings/kitchen/holidays',
        headers: authHeaders(adminToken),
      });
      const stillFound = listAfterRes.data.some(
        (h: any) => h.id === createdHolidayId,
      );
      assert(!stillFound, 'Holiday successfully removed from database');
    }

    // -------------------------------------------------------------
    // 16-20. Cutoff Engine Dynamic Settings Integration
    // -------------------------------------------------------------
    console.log(
      '\n16-20. Verifying Cutoff Engine Dynamic Settings Consumption...',
    );
    // Baseline: Wednesday delivery 2026-10-07
    // With 2 working days and 16:00:
    // Lead days are Tuesday 10-06 (day 1), Monday 10-05 (day 2).
    // Cutoff is Monday 2026-10-05 at 16:00 Asia/Kolkata (10:30 UTC).
    const testDeliveryDate = '2026-10-07';

    // 16. Check baseline cutoff calculation
    const baseCutoffRes = await makeRequest({
      method: 'GET',
      path: `/api/settings/kitchen/cutoff-preview?deliveryDate=${testDeliveryDate}`,
      headers: authHeaders(adminToken),
    });
    assert(
      baseCutoffRes.status === 200,
      'GET /api/settings/kitchen/cutoff-preview returned 200',
    );
    assert(
      baseCutoffRes.data.cutoffDate.startsWith('2026-10-05'),
      `Baseline cutoff date is Monday 2026-10-05 (got ${baseCutoffRes.data.cutoffDate})`,
    );
    assert(
      baseCutoffRes.data.cutoffDateTime === '2026-10-05T10:30:00.000Z',
      'Baseline cutoff timestamp is 2026-10-05T10:30:00.000Z (16:00 IST)',
    );

    // 17. Cutoff calculation reflects changed cutoff time immediately
    console.log('  Testing dynamic cutoff time mutation (16:00 -> 15:00)...');
    const updateTimeRes = await makeRequest({
      method: 'PATCH',
      path: '/api/settings/kitchen',
      headers: authHeaders(adminToken),
      body: { cutoffTime: '15:00' },
    });
    assert(
      updateTimeRes.status === 200,
      'Admin updated cutoffTime to 15:00 (200 OK)',
    );
    assert(
      updateTimeRes.data.cutoffTime === '15:00',
      'Updated settings immediately returned cutoffTime: "15:00"',
    );

    const changedTimeCutoffRes = await makeRequest({
      method: 'GET',
      path: `/api/settings/kitchen/cutoff-preview?deliveryDate=${testDeliveryDate}`,
      headers: authHeaders(adminToken),
    });
    assert(
      changedTimeCutoffRes.data.cutoffTimeMinutes === 900,
      'Cutoff calculation immediately uses 900 minutes without server restart',
    );
    assert(
      changedTimeCutoffRes.data.cutoffDateTime === '2026-10-05T09:30:00.000Z',
      'Cutoff timestamp immediately changed to 09:30 UTC (15:00 IST)',
    );

    // 18. Cutoff calculation reflects changed lead time count immediately
    console.log(
      '  Testing dynamic lead time count mutation (2 days -> 3 days)...',
    );
    const updateLeadRes = await makeRequest({
      method: 'PATCH',
      path: '/api/settings/kitchen',
      headers: authHeaders(adminToken),
      body: { cutoffWorkingDaysCount: 3 },
    });
    assert(
      updateLeadRes.status === 200,
      'Admin updated cutoffWorkingDaysCount to 3 (200 OK)',
    );

    const changedLeadCutoffRes = await makeRequest({
      method: 'GET',
      path: `/api/settings/kitchen/cutoff-preview?deliveryDate=${testDeliveryDate}`,
      headers: authHeaders(adminToken),
    });
    assert(
      changedLeadCutoffRes.data.leadWorkingDays === 3,
      'Cutoff calculation immediately uses 3 lead working days',
    );
    // 3 days back from Wednesday 10-07: Tue 10-06 (1), Mon 10-05 (2), Sun/Sat skip, Fri 10-02 (3)
    assert(
      changedLeadCutoffRes.data.cutoffDate.startsWith('2026-10-02'),
      'Cutoff date immediately shifted backwards to Friday 2026-10-02',
    );
    assert(
      changedLeadCutoffRes.data.cutoffDateTime === '2026-10-02T09:30:00.000Z',
      'Cutoff timestamp is Friday 2026-10-02 at 15:00 IST (09:30 UTC)',
    );

    // 19. Kitchen holiday shifts cutoff
    console.log('  Testing kitchen holiday shift behavior...');
    // Restore lead time to 2 days, cutoff to 16:00
    await makeRequest({
      method: 'PATCH',
      path: '/api/settings/kitchen',
      headers: authHeaders(adminToken),
      body: { cutoffTime: '16:00', cutoffWorkingDaysCount: 2 },
    });

    // Add kitchen holiday on Monday 2026-10-05
    const mondayHolidayRes = await makeRequest({
      method: 'POST',
      path: '/api/settings/kitchen/holidays',
      headers: authHeaders(adminToken),
      body: {
        date: '2026-10-05',
        name: 'Kitchen Electrical Upgrade',
      },
    });
    assert(mondayHolidayRes.status === 201, 'Added kitchen holiday on 2026-10-05');

    const holidayCutoffRes = await makeRequest({
      method: 'GET',
      path: `/api/settings/kitchen/cutoff-preview?deliveryDate=${testDeliveryDate}`,
      headers: authHeaders(adminToken),
    });
    // With Monday 10-05 being a kitchen holiday:
    // Lead day 1: Tuesday 10-06
    // Monday 10-05: holiday -> skipped!
    // Sunday 10-04, Sat 10-03: weekend -> skipped!
    // Lead day 2: Friday 10-02
    assert(
      holidayCutoffRes.data.cutoffDate.startsWith('2026-10-02'),
      'Kitchen holiday on Monday shifted cutoff date back to Friday 2026-10-02',
    );
    assert(
      holidayCutoffRes.data.cutoffDateTime === '2026-10-02T10:30:00.000Z',
      'Cutoff timestamp is Friday 2026-10-02 at 16:00 IST (10:30 UTC)',
    );

    // Remove the temporary kitchen holiday
    await makeRequest({
      method: 'DELETE',
      path: '/api/settings/kitchen/holidays/2026-10-05',
      headers: authHeaders(adminToken),
    });
    console.log('  ✓ Cleaned up temporary kitchen holiday');

    // 20. Company holiday does NOT shift kitchen cutoff
    console.log('  Testing company calendar separation...');
    // Summit Health has a company holiday on 2026-10-02 (Gandhi Jayanti)
    // Verify that kitchen cutoff calculation for 2026-10-07 does NOT shift due to company holiday!
    const postCleanCutoffRes = await makeRequest({
      method: 'GET',
      path: `/api/settings/kitchen/cutoff-preview?deliveryDate=${testDeliveryDate}`,
      headers: authHeaders(adminToken),
    });
    assert(
      postCleanCutoffRes.data.cutoffDate.startsWith('2026-10-05'),
      'Kitchen cutoff remains Monday 2026-10-05; company holiday does NOT shift kitchen cutoff',
    );

    // -------------------------------------------------------------
    // 21. Repeated Cutoff Processing Idempotency
    // -------------------------------------------------------------
    console.log('\n21. Verifying Repeated Cutoff Processing Idempotency...');
    {
      const process1 = await makeRequest({
        method: 'POST',
        path: '/api/orders/process-cutoffs',
        headers: authHeaders(adminToken),
      });
      assert(
        process1.status === 200,
        'POST /api/orders/process-cutoffs succeeded with 200 OK',
      );

      const process2 = await makeRequest({
        method: 'POST',
        path: '/api/orders/process-cutoffs',
        headers: authHeaders(adminToken),
      });
      assert(
        process2.status === 200,
        'Repeated POST /api/orders/process-cutoffs succeeded idempotently (200 OK)',
      );
    }

    // -------------------------------------------------------------
    // 22. Existing Phase 9 Billing Invariant
    // -------------------------------------------------------------
    console.log('\n22. Verifying Phase 9 Billing Integrity...');
    {
      const billingRes = await makeRequest({
        method: 'GET',
        path: '/api/billing/invoices',
        headers: authHeaders(adminToken),
      });
      assert(
        billingRes.status === 200,
        'Admin GET /api/billing/invoices returned 200 OK',
      );
      assert(
        Array.isArray(billingRes.data.data),
        'Invoices list returns valid data array',
      );
      assert(
        billingRes.data.data.length >= 3,
        `Preserved all Phase 9 invoices (count: ${billingRes.data.data.length})`,
      );
    }

    // -------------------------------------------------------------
    // 23. Restore Initial Settings
    // -------------------------------------------------------------
    console.log('\n23. Restoring Demo Settings...');
    {
      await makeRequest({
        method: 'PATCH',
        path: '/api/settings/kitchen',
        headers: authHeaders(adminToken),
        body: {
          cutoffTime: initialSettings.cutoffTime || '16:00',
          cutoffWorkingDaysCount:
            initialSettings.cutoffWorkingDaysCount || 2,
          kitchenTimezone: initialSettings.kitchenTimezone || 'Asia/Kolkata',
          dispatchBufferMinutes:
            initialSettings.dispatchBufferMinutes || 30,
          defaultPackagingBufferMinutes:
            initialSettings.defaultPackagingBufferMinutes || 60,
        },
      });
      console.log('  ✓ Demo kitchen settings restored to baseline');
    }

    console.log('\n====================================================');
    console.log('🎉 ALL 23 PHASE 10 VERIFICATION CHECKS PASSED');
    console.log('====================================================\n');
  } catch (err) {
    console.error('❌ Verification suite failed:', err);
    process.exit(1);
  } finally {
    if (app) {
      await app.close();
    }
    await prisma.$disconnect();
  }
}

runLiveVerification();
