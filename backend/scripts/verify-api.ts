import * as http from 'http';

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
        port: 4000,
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
            // Keep as string
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

async function main() {
  console.log('====================================================');
  console.log('MANUAL API VERIFICATION SUITE — LIVE HTTP SERVER');
  console.log('====================================================\n');

  const accounts = [
    { role: 'ADMIN', email: 'admin@test.com', pass: 'Test@1234' },
    { role: 'KITCHEN', email: 'kitchen@test.com', pass: 'Test@1234' },
    { role: 'DISPATCH', email: 'dispatch@test.com', pass: 'Test@1234' },
    { role: 'DRIVER', email: 'driver@test.com', pass: 'Test@1234' },
  ];

  const tokens: Record<string, string> = {};

  // 1. Health check
  console.log('1. Checking GET /api/health');
  const healthRes = await makeRequest({ method: 'GET', path: '/api/health' });
  console.log(`Status: ${healthRes.status}, Body:`, healthRes.data);
  if (healthRes.status !== 200) throw new Error('Health check failed');
  console.log('✔ Health check PASS\n');

  // 2. Authentication for all 4 accounts
  console.log('2. Verifying POST /api/auth/login for all 4 accounts');
  for (const acc of accounts) {
    const loginRes = await makeRequest({
      method: 'POST',
      path: '/api/auth/login',
      body: { email: acc.email, password: acc.pass },
    });
    console.log(`[${acc.role}] Login status: ${loginRes.status}`);
    if (loginRes.status !== 200 && loginRes.status !== 201) {
      throw new Error(`Login failed for ${acc.email} with status ${loginRes.status}`);
    }
    const { accessToken, user } = loginRes.data;
    if (!accessToken) throw new Error(`Missing accessToken for ${acc.email}`);
    if (user.password || user.passwordHash) {
      throw new Error(`CRITICAL: Password hash exposed in login response for ${acc.email}`);
    }
    console.log(`✔ [${acc.role}] Token received. User payload: id=${user.id}, email=${user.email}, role=${user.roleName}, permissionsCount=${user.permissions.length}`);
    tokens[acc.role] = accessToken;
  }
  console.log('✔ All 4 accounts logged in successfully\n');

  // 3. Negative authentication tests
  console.log('3. Verifying Authentication Failure handling');
  // 3a. Invalid password
  const badPassRes = await makeRequest({
    method: 'POST',
    path: '/api/auth/login',
    body: { email: 'admin@test.com', password: 'WrongPassword' },
  });
  console.log(`Bad password response status: ${badPassRes.status}, message: ${badPassRes.data.message || badPassRes.data}`);
  if (badPassRes.status !== 401) throw new Error(`Expected 401 for bad password, got ${badPassRes.status}`);
  console.log('✔ Invalid password returned 401 PASS');

  // 3b. Unknown email
  const unknownRes = await makeRequest({
    method: 'POST',
    path: '/api/auth/login',
    body: { email: 'nobody@nowhere.com', password: 'Test@1234' },
  });
  console.log(`Unknown user response status: ${unknownRes.status}, message: ${unknownRes.data.message || unknownRes.data}`);
  if (unknownRes.status !== 401) throw new Error(`Expected 401 for unknown user, got ${unknownRes.status}`);
  console.log('✔ Unknown user returned 401 PASS\n');

  // 4. Verifying GET /api/auth/me for each role
  console.log('4. Verifying GET /api/auth/me for all 4 roles');
  for (const acc of accounts) {
    const meRes = await makeRequest({
      method: 'GET',
      path: '/api/auth/me',
      headers: { Authorization: `Bearer ${tokens[acc.role]}` },
    });
    console.log(`[${acc.role}] GET /me status: ${meRes.status}`);
    if (meRes.status !== 200) throw new Error(`GET /me failed for ${acc.role}`);
    const u = meRes.data;
    if (u.password || u.passwordHash) {
      throw new Error(`CRITICAL: Password or passwordHash exposed in /me for ${acc.role}!`);
    }
    console.log(`   User ID:      ${u.id}`);
    console.log(`   Email:        ${u.email}`);
    console.log(`   Role:         ${u.roleName}`);
    console.log(`   Permissions:  ${u.permissions.length} items`);
    console.log(`   Sample perms: ${u.permissions.slice(0, 5).join(', ')}...`);
  }
  console.log('✔ GET /api/auth/me verified for all 4 accounts\n');

  // 5. Unauthenticated request to protected endpoint
  console.log('5. Verifying unauthenticated request to protected endpoint');
  const unauthRes = await makeRequest({
    method: 'GET',
    path: '/api/dashboards/admin',
  });
  console.log(`Unauthenticated GET /api/dashboards/admin status: ${unauthRes.status}`);
  if (unauthRes.status !== 401) throw new Error(`Expected 401 for unauthenticated, got ${unauthRes.status}`);
  console.log('✔ Unauthenticated request returned 401 PASS\n');

  // 6. Role-specific protected endpoints
  console.log('6. Verifying protected endpoints per role');

  // 6a. ADMIN endpoint: GET /api/dashboards/admin (requires 'dashboard.admin')
  console.log('-- Testing Admin Endpoint (/api/dashboards/admin) --');
  const adminAsAdmin = await makeRequest({
    method: 'GET',
    path: '/api/dashboards/admin',
    headers: { Authorization: `Bearer ${tokens['ADMIN']}` },
  });
  console.log(`ADMIN access: ${adminAsAdmin.status}`);
  if (adminAsAdmin.status !== 200) throw new Error(`ADMIN failed to access admin dashboard`);

  const kitchenAsAdmin = await makeRequest({
    method: 'GET',
    path: '/api/dashboards/admin',
    headers: { Authorization: `Bearer ${tokens['KITCHEN']}` },
  });
  console.log(`KITCHEN access to Admin: ${kitchenAsAdmin.status} (expected 403)`);
  if (kitchenAsAdmin.status !== 403) throw new Error(`KITCHEN was allowed on admin dashboard!`);

  const dispatchAsAdmin = await makeRequest({
    method: 'GET',
    path: '/api/dashboards/admin',
    headers: { Authorization: `Bearer ${tokens['DISPATCH']}` },
  });
  console.log(`DISPATCH access to Admin: ${dispatchAsAdmin.status} (expected 403)`);
  if (dispatchAsAdmin.status !== 403) throw new Error(`DISPATCH was allowed on admin dashboard!`);

  const driverAsAdmin = await makeRequest({
    method: 'GET',
    path: '/api/dashboards/admin',
    headers: { Authorization: `Bearer ${tokens['DRIVER']}` },
  });
  console.log(`DRIVER access to Admin: ${driverAsAdmin.status} (expected 403)`);
  if (driverAsAdmin.status !== 403) throw new Error(`DRIVER was allowed on admin dashboard!`);
  console.log('✔ Admin endpoint boundaries PASS\n');

  // 6b. KITCHEN endpoint: GET /api/kitchen/board (requires 'kitchen.read')
  console.log('-- Testing Kitchen Endpoint (/api/kitchen/board) --');
  const kitchenAsKitchen = await makeRequest({
    method: 'GET',
    path: '/api/kitchen/board',
    headers: { Authorization: `Bearer ${tokens['KITCHEN']}` },
  });
  console.log(`KITCHEN access: ${kitchenAsKitchen.status}`);
  if (kitchenAsKitchen.status !== 200) throw new Error(`KITCHEN failed to access kitchen board`);

  const adminAsKitchen = await makeRequest({
    method: 'GET',
    path: '/api/kitchen/board',
    headers: { Authorization: `Bearer ${tokens['ADMIN']}` },
  });
  console.log(`ADMIN access to Kitchen: ${adminAsKitchen.status} (expected 200 since admin has all perms)`);
  if (adminAsKitchen.status !== 200) throw new Error(`ADMIN failed kitchen endpoint`);

  const driverAsKitchen = await makeRequest({
    method: 'GET',
    path: '/api/kitchen/board',
    headers: { Authorization: `Bearer ${tokens['DRIVER']}` },
  });
  console.log(`DRIVER access to Kitchen: ${driverAsKitchen.status} (expected 403)`);
  if (driverAsKitchen.status !== 403) throw new Error(`DRIVER was allowed on kitchen board!`);
  console.log('✔ Kitchen endpoint boundaries PASS\n');

  // 6c. DISPATCH endpoint: GET /api/dispatch/drops (requires 'dispatch.read')
  console.log('-- Testing Dispatch Endpoint (/api/dispatch/drops) --');
  const dispatchAsDispatch = await makeRequest({
    method: 'GET',
    path: '/api/dispatch/drops',
    headers: { Authorization: `Bearer ${tokens['DISPATCH']}` },
  });
  console.log(`DISPATCH access: ${dispatchAsDispatch.status}`);
  if (dispatchAsDispatch.status !== 200) throw new Error(`DISPATCH failed to access dispatch drops`);

  const kitchenAsDispatch = await makeRequest({
    method: 'GET',
    path: '/api/dispatch/drops',
    headers: { Authorization: `Bearer ${tokens['KITCHEN']}` },
  });
  console.log(`KITCHEN access to Dispatch: ${kitchenAsDispatch.status} (expected 403)`);
  if (kitchenAsDispatch.status !== 403) throw new Error(`KITCHEN was allowed on dispatch drops!`);

  const driverAsDispatch = await makeRequest({
    method: 'GET',
    path: '/api/dispatch/drops',
    headers: { Authorization: `Bearer ${tokens['DRIVER']}` },
  });
  console.log(`DRIVER access to Dispatch: ${driverAsDispatch.status} (expected 403)`);
  if (driverAsDispatch.status !== 403) throw new Error(`DRIVER was allowed on dispatch drops!`);
  console.log('✔ Dispatch endpoint boundaries PASS\n');

  // 6d. DRIVER endpoint: GET /api/dispatch/my-deliveries (requires 'driver.read_own_deliveries')
  console.log('-- Testing Driver Endpoint (/api/dispatch/my-deliveries) --');
  const driverAsDriver = await makeRequest({
    method: 'GET',
    path: '/api/dispatch/my-deliveries',
    headers: { Authorization: `Bearer ${tokens['DRIVER']}` },
  });
  console.log(`DRIVER access: ${driverAsDriver.status}`);
  if (driverAsDriver.status !== 200) throw new Error(`DRIVER failed to access my-deliveries`);

  const kitchenAsDriver = await makeRequest({
    method: 'GET',
    path: '/api/dispatch/my-deliveries',
    headers: { Authorization: `Bearer ${tokens['KITCHEN']}` },
  });
  console.log(`KITCHEN access to my-deliveries: ${kitchenAsDriver.status} (expected 403)`);
  if (kitchenAsDriver.status !== 403) throw new Error(`KITCHEN was allowed on driver deliveries!`);

  const dispatchAsDriver = await makeRequest({
    method: 'GET',
    path: '/api/dispatch/my-deliveries',
    headers: { Authorization: `Bearer ${tokens['DISPATCH']}` },
  });
  console.log(`DISPATCH access to my-deliveries: ${dispatchAsDriver.status} (expected 200, dispatch has driver.read_own_deliveries)`);
  if (dispatchAsDriver.status !== 200) throw new Error(`DISPATCH was rejected from my-deliveries`);
  console.log('✔ Driver endpoint boundaries PASS\n');

  console.log('====================================================');
  console.log('ALL LIVE HTTP MANUAL VERIFICATION TESTS PASSED (100%)');
  console.log('====================================================');
}

main().catch((err) => {
  console.error('FAILED MANUAL API VERIFICATION:', err);
  process.exit(1);
});
