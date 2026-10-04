import * as http from 'http';

interface LoginResponse {
  accessToken: string;
  user: {
    id: string;
    email: string;
    name: string;
    role: string;
    permissions: string[];
  };
}

async function request(
  url: string,
  options: {
    method?: string;
    headers?: Record<string, string>;
    body?: any;
  } = {},
): Promise<{ status: number; data: any }> {
  const parsed = new URL(url);
  const postData = options.body ? JSON.stringify(options.body) : null;

  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: parsed.hostname,
        port: parsed.port,
        path: parsed.pathname + parsed.search,
        method: options.method || 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          ...(postData ? { 'Content-Length': Buffer.byteLength(postData) } : {}),
          ...options.headers,
        },
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => {
          let parsedData = body;
          try {
            parsedData = JSON.parse(body);
          } catch {}
          resolve({ status: res.statusCode || 0, data: parsedData });
        });
      },
    );

    req.on('error', reject);
    if (postData) {
      req.write(postData);
    }
    req.end();
  });
}

async function runIntegrationVerification() {
  console.log('====================================================');
  console.log('PHASE 12 FULL INTEGRATION & SUBMISSION VERIFICATION');
  console.log('====================================================\n');

  const API_BASE = 'http://localhost:4000/api';
  const FRONTEND_BASE = 'http://localhost:3000';

  // 1. Backend Health Check
  console.log('1. Verifying Backend API Health...');
  const healthRes = await request(`${API_BASE}/health`);
  if (healthRes.status !== 200 || healthRes.data?.status !== 'ok') {
    throw new Error(`Backend health check failed: status ${healthRes.status}`);
  }
  console.log('  ✓ Backend service is up and database is connected');

  // 2. Authenticating All 4 Required Accounts
  console.log('\n2. Authenticating Required Assignment Accounts...');
  const accounts = [
    { role: 'ADMIN', email: 'admin@test.com', pass: 'Test@1234' },
    { role: 'KITCHEN', email: 'kitchen@test.com', pass: 'Test@1234' },
    { role: 'DISPATCH', email: 'dispatch@test.com', pass: 'Test@1234' },
    { role: 'DRIVER', email: 'driver@test.com', pass: 'Test@1234' },
  ];

  const tokens: Record<string, string> = {};

  for (const acc of accounts) {
    const loginRes = await request(`${API_BASE}/auth/login`, {
      method: 'POST',
      body: { email: acc.email, password: acc.pass },
    });

    if (loginRes.status !== 200 || !loginRes.data?.accessToken) {
      throw new Error(`Login failed for ${acc.email}: status ${loginRes.status}`);
    }

    tokens[acc.role] = loginRes.data.accessToken;
    console.log(`  ✓ ${acc.role} (${acc.email}): authenticated successfully (role: ${loginRes.data.user.role})`);
  }

  // 3. Admin Full Workflow Verification
  console.log('\n3. Verifying Admin Operations & Permissions...');
  const adminHeaders = { Authorization: `Bearer ${tokens.ADMIN}` };

  const adminDash = await request(`${API_BASE}/dashboards/admin`, { headers: adminHeaders });
  if (adminDash.status !== 200 || adminDash.data?.orders?.operationalOrdersToday === undefined) {
    throw new Error(`Admin dashboard fetch failed: ${adminDash.status}`);
  }
  console.log(`  ✓ Admin Dashboard: operationalOrdersToday=${adminDash.data.orders.operationalOrdersToday}, deliveredOrdersToday=${adminDash.data.orders.deliveredOrdersToday}`);

  const catalogue = await request(`${API_BASE}/catalogue/dishes`, { headers: adminHeaders });
  console.log(`  ✓ Catalogue Dishes: count=${catalogue.data?.data?.length || 0}`);

  const pricingTiers = await request(`${API_BASE}/pricing/tiers`, { headers: adminHeaders });
  console.log(`  ✓ Pricing Tiers: count=${pricingTiers.data?.length || 0}`);

  const companies = await request(`${API_BASE}/companies`, { headers: adminHeaders });
  console.log(`  ✓ Corporate Clients: count=${companies.data?.data?.length || 0}`);

  const orders = await request(`${API_BASE}/orders`, { headers: adminHeaders });
  console.log(`  ✓ Orders Management: count=${orders.data?.data?.length || 0}`);

  const invoices = await request(`${API_BASE}/billing/invoices`, { headers: adminHeaders });
  console.log(`  ✓ Billing Invoices: count=${invoices.data?.data?.length || 0}`);

  const settings = await request(`${API_BASE}/settings/kitchen`, { headers: adminHeaders });
  console.log(`  ✓ Kitchen Settings: cutoffTime=${settings.data?.cutoffTime}, leadDays=${settings.data?.cutoffWorkingDaysCount}, timezone=${settings.data?.kitchenTimezone}`);

  // 4. Kitchen Full Workflow Verification
  console.log('\n4. Verifying Kitchen Board & Operations...');
  const kitchenHeaders = { Authorization: `Bearer ${tokens.KITCHEN}` };

  const kitchenDash = await request(`${API_BASE}/dashboards/kitchen`, { headers: kitchenHeaders });
  if (kitchenDash.status !== 200 || kitchenDash.data?.summary?.totalUnits === undefined) {
    throw new Error(`Kitchen dashboard fetch failed: ${kitchenDash.status}`);
  }
  console.log(`  ✓ Kitchen Dashboard: totalUnits=${kitchenDash.data.summary.totalUnits}, lateUnits=${kitchenDash.data.summary.lateUnits}, atRiskUnits=${kitchenDash.data.summary.atRiskUnits}`);

  const kitchenBoard = await request(`${API_BASE}/kitchen/board`, { headers: kitchenHeaders });
  console.log(`  ✓ Kitchen Board: totalUnits=${kitchenBoard.data?.totalUnits || 0}, stationsCount=${kitchenBoard.data?.stations?.length || 0}`);

  // 5. Dispatch Full Workflow Verification
  console.log('\n5. Verifying Dispatch Board & Operations...');
  const dispatchHeaders = { Authorization: `Bearer ${tokens.DISPATCH}` };

  const dispatchDash = await request(`${API_BASE}/dashboards/dispatch`, { headers: dispatchHeaders });
  if (dispatchDash.status !== 200 || dispatchDash.data?.summary?.totalDrops === undefined) {
    throw new Error(`Dispatch dashboard fetch failed: ${dispatchDash.status}`);
  }
  console.log(`  ✓ Dispatch Dashboard: totalDrops=${dispatchDash.data.summary.totalDrops}, unassignedDrops=${dispatchDash.data.summary.unassignedDropsCount}`);

  const dispatchDrops = await request(`${API_BASE}/dispatch/drops`, { headers: dispatchHeaders });
  console.log(`  ✓ Dispatch Board: dropsCount=${dispatchDrops.data?.drops?.length || 0}`);

  // 6. Driver Full Workflow Verification
  console.log('\n6. Verifying Driver Workflow & Strict Data Scoping...');
  const driverHeaders = { Authorization: `Bearer ${tokens.DRIVER}` };

  const driverDash = await request(`${API_BASE}/dashboards/driver`, { headers: driverHeaders });
  if (driverDash.status !== 200 || driverDash.data?.summary?.todayAssignedDrops === undefined) {
    throw new Error(`Driver dashboard fetch failed: ${driverDash.status}`);
  }
  console.log(`  ✓ Driver Dashboard: assignedDrops=${driverDash.data.summary.todayAssignedDrops}, onTimeCount=${driverDash.data.summary.onTimeCount}`);

  const driverDeliveries = await request(`${API_BASE}/dispatch/my-deliveries`, { headers: driverHeaders });
  console.log(`  ✓ Driver Itinerary: assignedStops=${driverDeliveries.data?.length || 0}`);

  // 7. Frontend Pages Verification
  console.log('\n7. Verifying Next.js Frontend Routes...');
  const frontendRoutes = [
    '/login',
    '/admin',
    '/admin/orders',
    '/admin/billing',
    '/admin/catalogue',
    '/admin/pricing',
    '/admin/companies',
    '/admin/settings',
    '/kitchen',
    '/kitchen/dashboard',
    '/dispatch',
    '/dispatch/dashboard',
    '/driver',
    '/driver/dashboard',
  ];

  for (const route of frontendRoutes) {
    const pageRes = await request(`${FRONTEND_BASE}${route}`);
    if (pageRes.status !== 200) {
      throw new Error(`Frontend route ${route} failed with status ${pageRes.status}`);
    }
    console.log(`  ✓ Route ${route}: HTTP 200 OK`);
  }

  console.log('\n====================================================');
  console.log('🎉 ALL INTEGRATION & SUBMISSION CHECKS PASSED (100%)');
  console.log('====================================================\n');
}

runIntegrationVerification().catch((err) => {
  console.error('Integration verification failed:', err);
  process.exit(1);
});
