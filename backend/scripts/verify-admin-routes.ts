import * as http from 'http';

function request(
  url: string,
  options: {
    method?: string;
    headers?: Record<string, string>;
    body?: any;
  } = {},
): Promise<{ status: number; data: any; headers: http.IncomingHttpHeaders }> {
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
          Accept: 'application/json',
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
          resolve({ status: res.statusCode || 0, data: parsedData, headers: res.headers });
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

async function runAdminRoutesVerification() {
  console.log('====================================================');
  console.log('ADMIN ROUTES & CLIENT NORMALIZATION VERIFICATION');
  console.log('====================================================\n');

  const API_BASE = 'http://localhost:4000/api';
  const FRONTEND_BASE = 'http://localhost:3000';

  // 1. Authenticate Admin
  console.log('1. Authenticating as admin@test.com...');
  const loginRes = await request(`${API_BASE}/auth/login`, {
    method: 'POST',
    body: { email: 'admin@test.com', password: 'Test@1234' },
  });

  if (loginRes.status !== 200 || !loginRes.data.accessToken) {
    throw new Error('Admin login failed');
  }
  const token = loginRes.data.accessToken;
  const authHeaders = { Authorization: `Bearer ${token}` };
  console.log('  ✓ Admin authenticated successfully');

  // 2. Verify Companies API Contract & Client Normalization
  console.log('\n2. Verifying /api/companies contract & array normalization...');
  const compRes = await request(`${API_BASE}/companies`, { headers: authHeaders });
  if (compRes.status !== 200) {
    throw new Error(`/api/companies failed with status ${compRes.status}`);
  }
  const rawCompanies = compRes.data;
  console.log(`  ✓ Backend response keys: [${Object.keys(rawCompanies).join(', ')}]`);
  const normalizedCompanies = Array.isArray(rawCompanies) ? rawCompanies : rawCompanies?.data || [];
  if (!Array.isArray(normalizedCompanies) || normalizedCompanies.length === 0) {
    throw new Error('Normalized companies is not an array or is empty');
  }
  console.log(`  ✓ Successfully normalized ${normalizedCompanies.length} companies for UI dropdowns without crash`);
  console.log(`  ✓ Sample company: "${normalizedCompanies[0].name}" (ID: ${normalizedCompanies[0].id})`);

  // 3. Verify Orders API Contract
  console.log('\n3. Verifying /api/orders pagination & order list contract...');
  const ordersRes = await request(`${API_BASE}/orders?page=1&limit=15`, { headers: authHeaders });
  if (ordersRes.status !== 200) {
    throw new Error(`/api/orders failed with status ${ordersRes.status}`);
  }
  const { orders, total, page, limit, totalPages } = ordersRes.data;
  if (!Array.isArray(orders)) {
    throw new Error('orders property is not an array');
  }
  console.log(`  ✓ Orders endpoint returned ${orders.length} orders (total: ${total}, totalPages: ${totalPages})`);
  const firstOrder = orders[0];
  console.log(`  ✓ Sample order: ${firstOrder.orderNumber || firstOrder.id} - Status: ${firstOrder.status} - Amount: $${(firstOrder.totalCents / 100).toFixed(2)}`);

  // 4. Verify Single Order Detail with Lines and Combinations
  console.log('\n4. Verifying /api/orders/:id full line item and combination hydration...');
  const detailRes = await request(`${API_BASE}/orders/${firstOrder.id}`, { headers: authHeaders });
  if (detailRes.status !== 200) {
    throw new Error(`Order detail failed for ${firstOrder.id}`);
  }
  const orderDetail = detailRes.data;
  if (!Array.isArray(orderDetail.lines) || orderDetail.lines.length === 0) {
    throw new Error('Order detail has no lines');
  }
  console.log(`  ✓ Order detail contains ${orderDetail.lines.length} line(s) with combinations`);
  console.log(`  ✓ Line item snapshot: ${orderDetail.lines[0].dishNameSnapshot} ($${(orderDetail.lines[0].lineTotalCents / 100).toFixed(2)})`);

  // 5. Verify Employees API Contract & Normalization
  console.log('\n5. Verifying /api/employees contract & array normalization...');
  const empRes = await request(`${API_BASE}/employees`, { headers: authHeaders });
  if (empRes.status !== 200) {
    throw new Error(`/api/employees failed with status ${empRes.status}`);
  }
  const rawEmployees = empRes.data;
  const normalizedEmployees = Array.isArray(rawEmployees) ? rawEmployees : rawEmployees?.data || [];
  console.log(`  ✓ Successfully normalized ${normalizedEmployees.length} employees`);

  // 6. Verify Billing Invoices API Contract & Normalization
  console.log('\n6. Verifying /api/billing/invoices contract & normalization...');
  const invRes = await request(`${API_BASE}/billing/invoices`, { headers: authHeaders });
  if (invRes.status !== 200) {
    throw new Error(`/api/billing/invoices failed with status ${invRes.status}`);
  }
  const rawInvoices = invRes.data;
  const normalizedInvoices = Array.isArray(rawInvoices) ? rawInvoices : rawInvoices?.data || rawInvoices?.invoices || [];
  console.log(`  ✓ Successfully normalized ${normalizedInvoices.length} invoices`);

  // 7. Verify All Frontend Admin Routes Return 200 OK
  console.log('\n7. Verifying All Frontend Admin Routes in Next.js Server...');
  const adminRoutes = [
    '/admin',
    '/admin/orders',
    '/admin/billing',
    '/admin/catalogue',
    '/admin/pricing',
    '/admin/companies',
    '/admin/employees',
    '/admin/settings',
  ];

  for (const route of adminRoutes) {
    const pageRes = await request(`${FRONTEND_BASE}${route}`);
    if (pageRes.status !== 200) {
      throw new Error(`Route ${route} returned HTTP ${pageRes.status}`);
    }
    console.log(`  ✓ ${route} -> HTTP 200 OK`);
  }

  console.log('\n====================================================');
  console.log('🎉 ALL ADMIN ROUTES & CLIENT NORMALIZATION CHECKS PASSED (100%)');
  console.log('====================================================\n');
}

runAdminRoutesVerification().catch((err) => {
  console.error('Verification failed:', err);
  process.exit(1);
});
