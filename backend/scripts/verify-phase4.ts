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
  console.log('PHASE 4 MANUAL API VERIFICATION SUITE — LIVE HTTP');
  console.log('====================================================\n');

  // 1. Authenticate as ADMIN and DRIVER
  console.log('1. Authenticating Admin and Driver');
  const adminLogin = await makeRequest({
    method: 'POST',
    path: '/api/auth/login',
    body: { email: 'admin@test.com', password: 'Test@1234' },
  });
  if (adminLogin.status !== 200) throw new Error('Admin login failed');
  const adminToken = adminLogin.data.accessToken;

  const driverLogin = await makeRequest({
    method: 'POST',
    path: '/api/auth/login',
    body: { email: 'driver@test.com', password: 'Test@1234' },
  });
  if (driverLogin.status !== 200) throw new Error('Driver login failed');
  const driverToken = driverLogin.data.accessToken;
  console.log('✔ Authenticated both accounts successfully\n');

  // 2. Admin Catalogue Access
  console.log('2. Admin Catalogue Management');
  // 2a. Reference data
  const refRes = await makeRequest({
    method: 'GET',
    path: '/api/catalogue/reference-data',
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  console.log(`GET /reference-data status: ${refRes.status}`);
  if (refRes.status !== 200) throw new Error('Failed to get reference data');

  // 2b. Create Kitchen Station
  const stationName = `Hot Kitchen ${Date.now()}`;
  const stationRes = await makeRequest({
    method: 'POST',
    path: '/api/catalogue/reference-data/kitchen-stations',
    headers: { Authorization: `Bearer ${adminToken}` },
    body: { name: stationName },
  });
  console.log(`POST reference-data station status: ${stationRes.status}`);
  const stationId = stationRes.data.id;

  // 2c. Create Option
  const optionRes = await makeRequest({
    method: 'POST',
    path: '/api/catalogue/options',
    headers: { Authorization: `Bearer ${adminToken}` },
    body: {
      name: `Truffle Mayo ${Date.now()}`,
      costPriceCents: 75,
    },
  });
  console.log(`POST /catalogue/options status: ${optionRes.status}`);
  if (optionRes.status !== 201) throw new Error('Failed to create option');
  const optionId = optionRes.data.id;

  // 2d. Create Option Group
  const groupRes = await makeRequest({
    method: 'POST',
    path: '/api/catalogue/option-groups',
    headers: { Authorization: `Bearer ${adminToken}` },
    body: {
      name: `Sauce Choice ${Date.now()}`,
      isRequired: true,
      usesPortions: false,
      options: [{ optionId, displayOrder: 0 }],
    },
  });
  console.log(`POST /catalogue/option-groups status: ${groupRes.status}`);
  if (groupRes.status !== 201) throw new Error('Failed to create option group');
  const groupId = groupRes.data.id;

  // 2e. Create Dish
  const dishSku = `SKU-BURGER-${Date.now()}`;
  const dishRes = await makeRequest({
    method: 'POST',
    path: '/api/catalogue/dishes',
    headers: { Authorization: `Bearer ${adminToken}` },
    body: {
      sku: dishSku,
      name: 'Artisan Burger',
      description: 'Handcrafted brioche with prime beef',
      temperature: 'HOT',
      costPriceCents: 450,
      minimumOrderQuantity: 1,
      kitchenStationId: stationId,
      optionGroups: [{ optionGroupId: groupId, displayOrder: 0 }],
    },
  });
  console.log(`POST /catalogue/dishes status: ${dishRes.status}`);
  if (dishRes.status !== 201) throw new Error(`Failed to create dish: ${JSON.stringify(dishRes.data)}`);
  const dishId = dishRes.data.id;

  // 2f. Query dishes with pagination
  const dishesListRes = await makeRequest({
    method: 'GET',
    path: `/api/catalogue/dishes?search=Artisan&page=1&limit=10`,
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  console.log(`GET /catalogue/dishes pagination status: ${dishesListRes.status}, total found: ${dishesListRes.data.meta.total}`);
  if (dishesListRes.status !== 200 || dishesListRes.data.meta.total < 1) {
    throw new Error('Dishes search failed');
  }

  // 2g. Deactivate and activate dish
  const deactRes = await makeRequest({
    method: 'POST',
    path: `/api/catalogue/dishes/${dishId}/deactivate`,
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  console.log(`POST /dishes/:id/deactivate status: ${deactRes.status}, isActive=${deactRes.data.isActive}`);
  if (deactRes.data.isActive !== false) throw new Error('Deactivate failed');

  const actRes = await makeRequest({
    method: 'POST',
    path: `/api/catalogue/dishes/${dishId}/activate`,
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  console.log(`POST /dishes/:id/activate status: ${actRes.status}, isActive=${actRes.data.isActive}`);
  if (actRes.data.isActive !== true) throw new Error('Re-activate failed');
  console.log('✔ Catalogue management PASS\n');

  // 3. Menu Management
  console.log('3. Admin Menu Management');
  // 3a. Create standard category
  const catRes = await makeRequest({
    method: 'POST',
    path: '/api/menu/categories',
    headers: { Authorization: `Bearer ${adminToken}` },
    body: {
      name: `Signature Mains ${Date.now()}`,
      displayOrder: 1,
      isSecret: false,
    },
  });
  console.log(`POST /menu/categories status: ${catRes.status}`);
  const catId = catRes.data.id;

  // 3b. Add dish to category
  const addDishRes = await makeRequest({
    method: 'POST',
    path: `/api/menu/categories/${catId}/dishes`,
    headers: { Authorization: `Bearer ${adminToken}` },
    body: { dishId, displayOrder: 0 },
  });
  console.log(`POST /menu/categories/:id/dishes status: ${addDishRes.status}`);
  if (addDishRes.status !== 201) throw new Error('Failed to add dish to category');

  // 3c. Create secret category
  const secretCatRes = await makeRequest({
    method: 'POST',
    path: '/api/menu/categories',
    headers: { Authorization: `Bearer ${adminToken}` },
    body: {
      name: `VIP Secret Cellar ${Date.now()}`,
      displayOrder: 99,
      isSecret: true,
    },
  });
  console.log(`POST /menu/categories (secret) status: ${secretCatRes.status}`);
  const secretCatId = secretCatRes.data.id;

  // 3d. Check normal category listing excludes secret category
  const normalCatsRes = await makeRequest({
    method: 'GET',
    path: '/api/menu/categories',
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  const hasSecretInNormal = normalCatsRes.data.some((c: any) => c.id === secretCatId);
  console.log(`Normal category listing excludes secret: ${!hasSecretInNormal}`);
  if (hasSecretInNormal) throw new Error('Secret category leaked in normal listing!');

  // 3e. Check includeSecret=true includes it
  const allCatsRes = await makeRequest({
    method: 'GET',
    path: '/api/menu/categories?includeSecret=true',
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  const hasSecretInAll = allCatsRes.data.some((c: any) => c.id === secretCatId);
  console.log(`IncludeSecret=true includes secret: ${hasSecretInAll}`);
  if (!hasSecretInAll) throw new Error('Secret category missing when includeSecret=true');
  console.log('✔ Menu management PASS\n');

  // 4. Pricing Management
  console.log('4. Admin Pricing Management');
  // 4a. List tiers
  const tiersRes = await makeRequest({
    method: 'GET',
    path: '/api/pricing/tiers',
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  console.log(`GET /pricing/tiers status: ${tiersRes.status}, count: ${tiersRes.data.length}`);
  const defaultTier = tiersRes.data.find((t: any) => t.isDefault);
  if (!defaultTier) throw new Error('Default price tier missing');

  // 4b. Set explicit dish price on default tier
  const bulkDishRes = await makeRequest({
    method: 'PUT',
    path: `/api/pricing/tiers/${defaultTier.id}/dishes`,
    headers: { Authorization: `Bearer ${adminToken}` },
    body: {
      prices: [{ dishId, priceCents: 1250 }], // $12.50
    },
  });
  console.log(`PUT /pricing/tiers/:id/dishes status: ${bulkDishRes.status}`);
  if (bulkDishRes.status !== 200) throw new Error('Failed to set explicit dish price');

  // 4c. Set explicit option price on default tier
  const bulkOptRes = await makeRequest({
    method: 'PUT',
    path: `/api/pricing/tiers/${defaultTier.id}/options`,
    headers: { Authorization: `Bearer ${adminToken}` },
    body: {
      prices: [{ optionId, priceCents: 150 }], // $1.50
    },
  });
  console.log(`PUT /pricing/tiers/:id/options status: ${bulkOptRes.status}`);
  if (bulkOptRes.status !== 200) throw new Error('Failed to set explicit option price');

  // 4d. Create derived tier (Cost Multiplier: 2.2x = 22000 bps)
  const derivedTierRes = await makeRequest({
    method: 'POST',
    path: '/api/pricing/tiers',
    headers: { Authorization: `Bearer ${adminToken}` },
    body: {
      name: `Premium Markup Tier ${Date.now()}`,
      ruleType: 'COST_MULTIPLIER',
      ruleValueBps: 22000,
    },
  });
  console.log(`POST /pricing/tiers (COST_MULTIPLIER) status: ${derivedTierRes.status}`);
  if (derivedTierRes.status !== 201) throw new Error('Failed to create derived tier');
  console.log('✔ Pricing management PASS\n');

  // 5. Non-Admin Access Boundaries (RBAC verification)
  console.log('5. Non-Admin RBAC Boundaries');
  // Driver tries to create dish
  const driverDishRes = await makeRequest({
    method: 'POST',
    path: '/api/catalogue/dishes',
    headers: { Authorization: `Bearer ${driverToken}` },
    body: { sku: 'TEST-SKU', name: 'Unauthorized Dish', temperature: 'HOT', costPriceCents: 100 },
  });
  console.log(`Driver create dish status: ${driverDishRes.status} (expected 403)`);
  if (driverDishRes.status !== 403) throw new Error('Driver was allowed to create dish!');

  // Driver tries to create category
  const driverCatRes = await makeRequest({
    method: 'POST',
    path: '/api/menu/categories',
    headers: { Authorization: `Bearer ${driverToken}` },
    body: { name: 'Unauthorized Category' },
  });
  console.log(`Driver create category status: ${driverCatRes.status} (expected 403)`);
  if (driverCatRes.status !== 403) throw new Error('Driver was allowed to create category!');

  // Driver tries to create tier
  const driverTierRes = await makeRequest({
    method: 'POST',
    path: '/api/pricing/tiers',
    headers: { Authorization: `Bearer ${driverToken}` },
    body: { name: 'Unauthorized Tier' },
  });
  console.log(`Driver create price tier status: ${driverTierRes.status} (expected 403)`);
  if (driverTierRes.status !== 403) throw new Error('Driver was allowed to create tier!');
  console.log('✔ RBAC Boundaries PASS\n');

  // 6. Menu Preview & Price Resolution
  console.log('6. Menu Preview and Price Resolution');
  const previewRes = await makeRequest({
    method: 'GET',
    path: '/api/menu/preview',
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  console.log(`GET /menu/preview status: ${previewRes.status}`);
  if (previewRes.status !== 200) throw new Error('Failed to get menu preview');

  const previewCat = previewRes.data.categories.find((c: any) => c.id === catId);
  if (!previewCat) throw new Error(`Category '${catId}' missing from preview`);
  const previewDish = previewCat.dishes.find((d: any) => d.id === dishId);
  if (!previewDish) throw new Error(`Dish '${dishId}' missing from preview`);

  console.log(`Preview Dish: ${previewDish.name} (SKU: ${previewDish.sku})`);
  console.log(`Resolved Price: ${previewDish.priceCents} cents ($${(previewDish.priceCents / 100).toFixed(2)})`);
  console.log(`Is Explicit Price: ${previewDish.isExplicitPrice}`);
  if (previewDish.priceCents !== 1250) {
    throw new Error(`Expected price 1250 cents, got ${previewDish.priceCents}`);
  }

  const previewOptGroup = previewDish.optionGroups.find((g: any) => g.id === groupId);
  if (!previewOptGroup) throw new Error('Option group missing in preview dish');
  const previewOpt = previewOptGroup.options.find((o: any) => o.id === optionId);
  if (!previewOpt) throw new Error('Option missing in preview option group');
  console.log(`Preview Option: ${previewOpt.name}, Price: ${previewOpt.priceCents} cents`);
  if (previewOpt.priceCents !== 150) {
    throw new Error(`Expected option price 150 cents, got ${previewOpt.priceCents}`);
  }
  console.log('✔ Menu Preview & Price Resolution PASS\n');

  console.log('====================================================');
  console.log('ALL PHASE 4 LIVE HTTP VERIFICATION TESTS PASSED (100%)');
  console.log('====================================================');
}

main().catch((err) => {
  console.error('FAILED PHASE 4 MANUAL API VERIFICATION:', err);
  process.exit(1);
});
