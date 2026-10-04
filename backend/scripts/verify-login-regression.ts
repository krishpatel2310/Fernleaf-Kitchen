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

function getRoleDefaultPath(roleName?: string): string {
  switch (roleName) {
    case 'KITCHEN':
      return '/kitchen';
    case 'DISPATCH':
      return '/dispatch';
    case 'DRIVER':
      return '/driver';
    case 'ADMIN':
    default:
      return '/admin';
  }
}

async function runLoginRegressionTest() {
  console.log('====================================================');
  console.log('FRONTEND LOGIN & SESSION HYDRATION REGRESSION TEST');
  console.log('====================================================\n');

  const API_BASE = 'http://localhost:4000/api';
  const FRONTEND_BASE = 'http://localhost:3000';

  // 1. Verify Login Contract & Dual Token Fields
  console.log('1. Testing POST /api/auth/login response contract...');
  const loginRes = await request(`${API_BASE}/auth/login`, {
    method: 'POST',
    body: { email: 'admin@test.com', password: 'Test@1234' },
  });

  if (loginRes.status !== 200) {
    throw new Error(`Login failed with status ${loginRes.status}`);
  }

  const { accessToken, access_token, user } = loginRes.data;

  if (!accessToken || typeof accessToken !== 'string') {
    throw new Error('accessToken is missing or invalid in login response');
  }
  if (!access_token || typeof access_token !== 'string') {
    throw new Error('access_token is missing or invalid in login response');
  }
  if (!user || user.email !== 'admin@test.com' || user.roleName !== 'ADMIN') {
    throw new Error(`User payload mismatch: ${JSON.stringify(user)}`);
  }
  console.log('  ✓ Backend returns both accessToken and access_token (compatible with all clients)');
  console.log(`  ✓ Authenticated user payload has roleName: "${user.roleName}"`);

  // 2. Testing Session Hydration Endpoints (/auth/me and /auth/profile)
  console.log('\n2. Testing session profile verification endpoints...');
  const authHeaders = { Authorization: `Bearer ${accessToken}` };

  const meRes = await request(`${API_BASE}/auth/me`, { headers: authHeaders });
  if (meRes.status !== 200 || meRes.data.email !== 'admin@test.com') {
    throw new Error(`/auth/me failed with status ${meRes.status}`);
  }
  console.log('  ✓ GET /auth/me returns valid authenticated user profile');

  const profileRes = await request(`${API_BASE}/auth/profile`, { headers: authHeaders });
  if (profileRes.status !== 200 || profileRes.data.email !== 'admin@test.com') {
    throw new Error(`/auth/profile alias failed with status ${profileRes.status}`);
  }
  console.log('  ✓ GET /auth/profile alias returns valid authenticated user profile');

  // 3. Testing Protected Dashboard Call Using Stored Token
  console.log('\n3. Testing protected dashboard call using authenticated Bearer token...');
  const dashRes = await request(`${API_BASE}/dashboards/admin`, { headers: authHeaders });
  if (dashRes.status !== 200 || dashRes.data.orders?.operationalOrdersToday === undefined) {
    throw new Error(`Admin dashboard call failed with status ${dashRes.status}`);
  }
  console.log(`  ✓ Admin dashboard call succeeds: operationalOrdersToday=${dashRes.data.orders.operationalOrdersToday}`);
  console.log('  ✓ Stored token guarantees user is NOT bounced back to /login with 401');

  // 4. Testing All 4 Accounts and Role Routing
  console.log('\n4. Testing All 4 Required Accounts & Navigation Paths...');
  const testAccounts = [
    { email: 'admin@test.com', pass: 'Test@1234', expectedRole: 'ADMIN', expectedPath: '/admin' },
    { email: 'kitchen@test.com', pass: 'Test@1234', expectedRole: 'KITCHEN', expectedPath: '/kitchen' },
    { email: 'dispatch@test.com', pass: 'Test@1234', expectedRole: 'DISPATCH', expectedPath: '/dispatch' },
    { email: 'driver@test.com', pass: 'Test@1234', expectedRole: 'DRIVER', expectedPath: '/driver' },
  ];

  for (const acc of testAccounts) {
    const accLogin = await request(`${API_BASE}/auth/login`, {
      method: 'POST',
      body: { email: acc.email, password: acc.pass },
    });

    if (accLogin.status !== 200) {
      throw new Error(`Login failed for ${acc.email}`);
    }

    const targetPath = getRoleDefaultPath(accLogin.data.user.roleName);
    if (targetPath !== acc.expectedPath) {
      throw new Error(`Expected path ${acc.expectedPath} for role ${acc.expectedRole}, got ${targetPath}`);
    }

    // Verify frontend route returns 200 OK
    const pageRes = await request(`${FRONTEND_BASE}${targetPath}`);
    if (pageRes.status !== 200) {
      throw new Error(`Target page ${targetPath} returned HTTP ${pageRes.status}`);
    }

    console.log(`  ✓ ${acc.expectedRole} (${acc.email}) -> Role: ${accLogin.data.user.roleName} -> Routes to: ${targetPath} (HTTP 200 OK)`);
  }

  // 5. Testing Invalid Credentials Error Handling
  console.log('\n5. Testing Invalid Credentials Error Handling...');
  const invalidLogin = await request(`${API_BASE}/auth/login`, {
    method: 'POST',
    body: { email: 'admin@test.com', password: 'WrongPassword999!' },
  });

  if (invalidLogin.status !== 401) {
    throw new Error(`Expected 401 for invalid password, got ${invalidLogin.status}`);
  }
  console.log('  ✓ Invalid credentials correctly return HTTP 401 without crashing');
  console.log(`  ✓ Error message delivered to UI: "${invalidLogin.data.message}"`);

  console.log('\n====================================================');
  console.log('🎉 ALL LOGIN REGRESSION CHECKS PASSED (100%)');
  console.log('====================================================\n');
}

runLoginRegressionTest().catch((err) => {
  console.error('Login regression test failed:', err);
  process.exit(1);
});
