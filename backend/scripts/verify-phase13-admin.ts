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

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${msg}`);
    throw new Error(`Assertion failed: ${msg}`);
  }
  console.log(`  ✓ ${msg}`);
}

async function runPhase13AdminAudit() {
  console.log('================================================================');
  console.log('PHASE 13: COMPLETE ADMIN FUNCTIONAL AUDIT & LIVE MUTATION TEST');
  console.log('================================================================\n');

  const API_BASE = 'http://localhost:4000/api';

  // 1. Authenticate Admin
  console.log('Step 1: Authenticating as admin@test.com...');
  const loginRes = await request(`${API_BASE}/auth/login`, {
    method: 'POST',
    body: { email: 'admin@test.com', password: 'Test@1234' },
  });
  assert(loginRes.status === 200, `Login status 200 (got ${loginRes.status})`);
  const token = loginRes.data.accessToken;
  assert(!!token, 'Received access token');
  const headers = { Authorization: `Bearer ${token}` };

  // 2. Dashboard Metrics Verification
  console.log('\nStep 2: Admin Dashboard API Verification...');
  const dashRes = await request(`${API_BASE}/dashboards/admin`, { headers });
  assert(dashRes.status === 200, `Dashboard status 200`);
  assert(typeof dashRes.data.orders?.operationalOrdersToday === 'number', 'operationalOrdersToday is numeric');
  assert(typeof dashRes.data.kitchenRisk === 'object', 'kitchenRisk present');
  assert(typeof dashRes.data.dispatch === 'object', 'dispatch present');
  assert(typeof dashRes.data.billing === 'object', 'billing present');

  // 3. Catalogue Dish Lifecycle: Create -> Read -> Update -> Deactivate -> Reactivate
  console.log('\nStep 3: Catalogue Dish Lifecycle (Deactivation, not Hard Delete)...');
  const timestamp = Date.now();
  const testDishSku = `TEST-SKU-${timestamp}`;
  const stationsRes = await request(`${API_BASE}/catalogue/stations`, { headers });
  const stationId = Array.isArray(stationsRes.data) && stationsRes.data.length > 0 ? stationsRes.data[0].id : null;

  const createDishRes = await request(`${API_BASE}/catalogue/dishes`, {
    method: 'POST',
    headers,
    body: {
      name: `Audit Test Dish ${timestamp}`,
      description: 'Temporary dish created during Phase 13 functional audit',
      sku: testDishSku,
      temperature: 'HOT',
      costPriceCents: 850,
      kitchenStationId: stationId,
      minimumOrderQuantity: 1,
    },
  });
  assert(createDishRes.status === 201, `Dish created with status 201 (got ${createDishRes.status})`);
  const createdDish = createDishRes.data;
  assert(createdDish.isActive === true, 'Dish created in ACTIVE status');
  assert(createdDish.costPriceCents === 850, 'Dish cost price stored as 850 cents');

  // Update dish
  const updateDishRes = await request(`${API_BASE}/catalogue/dishes/${createdDish.id}`, {
    method: 'PATCH',
    headers,
    body: {
      name: `Updated Test Dish ${timestamp}`,
      costPriceCents: 950,
    },
  });
  assert(updateDishRes.status === 200, 'Dish updated with status 200');
  assert(updateDishRes.data.name.startsWith('Updated Test Dish'), 'Dish name updated in database');
  assert(updateDishRes.data.costPriceCents === 950, 'Dish cost price updated to 950 cents');

  // Deactivate dish (PDF 4.1 Requirement: Dishes are deactivated, never deleted)
  const deactivateRes = await request(`${API_BASE}/catalogue/dishes/${createdDish.id}/deactivate`, {
    method: 'POST',
    headers,
  });
  if (deactivateRes.status !== 200 && deactivateRes.status !== 201) {
    console.log('Deactivate error:', deactivateRes.status, deactivateRes.data);
  }
  assert(deactivateRes.status === 200 || deactivateRes.status === 201, `Dish deactivated successfully with status 200 (got ${deactivateRes.status})`);
  assert(deactivateRes.data.isActive === false, 'Dish status is now INACTIVE (isActive = false)');

  // Reactivate dish
  const reactivateRes = await request(`${API_BASE}/catalogue/dishes/${createdDish.id}/activate`, {
    method: 'POST',
    headers,
  });
  assert(reactivateRes.status === 200 || reactivateRes.status === 201, `Dish reactivated successfully with status 200/201 (got ${reactivateRes.status})`);
  assert(reactivateRes.data.isActive === true, 'Dish status restored to ACTIVE');

  // 4. Menu Category Management
  console.log('\nStep 4: Menu Categories & Dish Association...');
  const createCatRes = await request(`${API_BASE}/menu/categories`, {
    method: 'POST',
    headers,
    body: {
      name: `Audit Category ${timestamp}`,
      description: 'Audit category for testing',
      displayOrder: 99,
      isSecret: false,
    },
  });
  assert(createCatRes.status === 201, 'Category created with status 201');
  const createdCat = createCatRes.data;

  // Add test dish to category
  const addDishToCatRes = await request(`${API_BASE}/menu/categories/${createdCat.id}/dishes`, {
    method: 'POST',
    headers,
    body: {
      dishId: createdDish.id,
      displayOrder: 1,
    },
  });
  assert(addDishToCatRes.status === 200 || addDishToCatRes.status === 201, `Dish added to category (got ${addDishToCatRes.status})`);

  // 5. Pricing Tier & Dish Price Management
  console.log('\nStep 5: Pricing Tier Creation & Explicit Dish Price Override...');
  const createTierRes = await request(`${API_BASE}/pricing/tiers`, {
    method: 'POST',
    headers,
    body: {
      name: `Audit Tier ${timestamp}`,
      description: 'Audit price tier',
      isDefault: false,
      ruleType: 'COST_MULTIPLIER',
      ruleValueBps: 15000,
    },
  });
  if (createTierRes.status !== 201) {
    console.log('Create tier error:', createTierRes.status, createTierRes.data);
  }
  assert(createTierRes.status === 201, `Price tier created with status 201 (got ${createTierRes.status})`);
  const createdTier = createTierRes.data;

  // Explicit dish price override in this tier
  const overridePriceRes = await request(`${API_BASE}/pricing/tiers/${createdTier.id}/dishes`, {
    method: 'PUT',
    headers,
    body: {
      prices: [
        {
          dishId: createdDish.id,
          priceCents: 1450,
        },
      ],
    },
  });
  if (overridePriceRes.status !== 200) {
    console.log('Override price error:', overridePriceRes.status, overridePriceRes.data);
  }
  assert(overridePriceRes.status === 200, 'Explicit dish price override stored');

  // Verify resolution
  const resolvedPriceRes = await request(`${API_BASE}/pricing/tiers/${createdTier.id}/dishes/${createdDish.id}/resolve`, {
    headers,
  });
  if (resolvedPriceRes.status === 200) {
    assert(resolvedPriceRes.data.resolvedPriceCents === 1450, 'Price resolution returned exact 1450 cents override');
  }

  // 6. Companies Management: Domain Validation & Addresses
  console.log('\nStep 6: Company Management & Normalized Domain Validation...');
  const testDomain = `audittest-${timestamp}.com`;
  const pkgRes = await request(`${API_BASE}/catalogue/packaging-types`, { headers });
  const packagingTypeId = Array.isArray(pkgRes.data) && pkgRes.data.length > 0 ? pkgRes.data[0].id : '';

  const createCompanyRes = await request(`${API_BASE}/companies`, {
    method: 'POST',
    headers,
    body: {
      name: `Audit Corp ${timestamp}`,
      billingContactName: 'Finance Lead',
      billingContactEmail: `billing@${testDomain}`,
      domains: [testDomain],
      defaultDeliveryTimeMinutes: 750,
      defaultPackagingTypeId: packagingTypeId,
      priceTierId: createdTier.id,
      addresses: [
        {
          label: 'Headquarters',
          addressLine1: '123 Audit Blvd',
          city: 'Bangalore',
          state: 'Karnataka',
          postalCode: '560001',
        },
      ],
    },
  });
  if (createCompanyRes.status !== 201) {
    console.log('Create company error:', createCompanyRes.status, createCompanyRes.data);
  }
  assert(createCompanyRes.status === 201, 'Company created with domain and address');
  const createdCompany = createCompanyRes.data;

  // Attempt duplicate domain rejection
  const dupDomainRes = await request(`${API_BASE}/companies/${createdCompany.id}/domains`, {
    method: 'POST',
    headers,
    body: { domain: testDomain },
  });
  assert(dupDomainRes.status === 400 || dupDomainRes.status === 409, `Duplicate domain correctly rejected (status ${dupDomainRes.status})`);

  // Add secondary verified domain
  const secDomain = `secondary-${timestamp}.com`;
  const addDomainRes = await request(`${API_BASE}/companies/${createdCompany.id}/domains`, {
    method: 'POST',
    headers,
    body: { domain: secDomain },
  });
  assert(addDomainRes.status === 201 || addDomainRes.status === 200, 'Secondary domain added successfully');

  // 7. Employee Management: Creation & Domain Matching
  console.log('\nStep 7: Employee Onboarding & Domain Matching Verification...');
  const createEmpRes = await request(`${API_BASE}/employees`, {
    method: 'POST',
    headers,
    body: {
      companyId: createdCompany.id,
      firstName: 'Audit',
      lastName: 'Tester',
      email: `tester@${testDomain}`,
      canChooseDeliveryAddress: true,
      canChangeDeliveryTime: true,
      canChangePackaging: false,
    },
  });
  if (createEmpRes.status !== 201) {
    console.log('Create emp error:', createEmpRes.status, createEmpRes.data);
  }
  assert(createEmpRes.status === 201, 'Employee created and linked to company');
  const createdEmp = createEmpRes.data;
  assert(createdEmp.companyId === createdCompany.id, 'Employee belongs to exact company');

  // 8. Order Lifecycle & Admin Override with Mandatory Note
  console.log('\nStep 8: Order Creation & Admin Override with Mandatory Note...');
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 3);
  const deliveryDateStr = tomorrow.toISOString().split('T')[0];

  const addressesRes = await request(`${API_BASE}/companies/${createdCompany.id}/addresses`, { headers });
  const addressId = Array.isArray(addressesRes.data) && addressesRes.data.length > 0 ? addressesRes.data[0].id : null;

  const createOrderRes = await request(`${API_BASE}/orders`, {
    method: 'POST',
    headers,
    body: {
      employeeId: createdEmp.id,
      deliveryDate: deliveryDateStr,
      companyAddressId: addressId,
      deliveryTimeMinutes: 720,
      packagingTypeId: packagingTypeId,
      lines: [
        {
          dishId: createdDish.id,
          quantity: 2,
        },
      ],
      isPlaced: true,
    },
  });
  if (createOrderRes.status !== 201) {
    console.log('Create order error:', createOrderRes.status, createOrderRes.data);
  }
  assert(createOrderRes.status === 201, 'Order created successfully on behalf of employee');
  const createdOrder = createOrderRes.data;

  // Confirm order if not already confirmed
  let confirmedOrderId = createdOrder.id;
  if (createdOrder.status !== 'CONFIRMED') {
    const confirmRes = await request(`${API_BASE}/orders/${createdOrder.id}/confirm`, {
      method: 'POST',
      headers,
    });
    if (confirmRes.status === 200) {
      assert(confirmRes.data.status === 'CONFIRMED', 'Order confirmed');
    }
  }

  // Admin Override: MUST require note (PDF 4.6)
  const failOverrideRes = await request(`${API_BASE}/orders/${confirmedOrderId}/override`, {
    method: 'POST',
    headers,
    body: {
      deliveryTimeMinutes: 750,
      // Missing mandatory note
    },
  });
  assert(failOverrideRes.status === 400, 'Admin override rejected when note is missing (HTTP 400)');

  // Admin Override with valid note
  const successOverrideRes = await request(`${API_BASE}/orders/${confirmedOrderId}/override`, {
    method: 'POST',
    headers,
    body: {
      deliveryTimeMinutes: 780,
      note: 'Executive meeting scheduled at 1:00 PM - client requested delivery shift',
    },
  });
  assert(successOverrideRes.status === 200, 'Admin override succeeded with mandatory note');
  assert(successOverrideRes.data.deliveryTimeMinutes === 780, 'Delivery time updated to 780 minutes');

  // Verify timeline contains the override audit record
  const timelineRes = await request(`${API_BASE}/orders/${confirmedOrderId}/timeline`, { headers });
  assert(timelineRes.status === 200, 'Order audit timeline fetched');
  const events = Array.isArray(timelineRes.data) ? timelineRes.data : timelineRes.data?.events || [];
  const overrideEvent = events.find((e: any) => e.type === 'ADMIN_OVERRIDE' || e.note?.includes('Executive meeting'));
  assert(!!overrideEvent, 'Audit timeline records ADMIN_OVERRIDE with user note');

  // 9. Billing: Invoicing & Inspection
  console.log('\nStep 9: Corporate Invoicing & Financial Mismatch Calculation...');
  const uninvOrdersRes = await request(`${API_BASE}/billing/uninvoiced-orders?companyId=${createdCompany.id}`, { headers });
  assert(uninvOrdersRes.status === 200, 'Uninvoiced orders fetched');

  const invoicesRes = await request(`${API_BASE}/billing/invoices`, { headers });
  assert(invoicesRes.status === 200, 'Invoices list fetched');

  if (Array.isArray(invoicesRes.data.data) && invoicesRes.data.data.length > 0) {
    const firstInvoice = invoicesRes.data.data[0];
    const invoiceDetailRes = await request(`${API_BASE}/billing/invoices/${firstInvoice.id}`, { headers });
    assert(invoiceDetailRes.status === 200, 'Invoice detail endpoint returns 200');
    assert(typeof invoiceDetailRes.data.totalCents === 'number', 'Invoice has totalCents');
    assert(typeof invoiceDetailRes.data.hasAdjustments === 'boolean', 'Invoice detail computes hasAdjustments');
  }

  // 10. Operational Settings: Cutoff, Working Days & Holidays
  console.log('\nStep 10: Operational Settings & Kitchen Working Days Schedule...');
  const currentSettingsRes = await request(`${API_BASE}/settings/kitchen`, { headers });
  assert(currentSettingsRes.status === 200, 'Kitchen settings fetched');

  const updateSettingsRes = await request(`${API_BASE}/settings/kitchen`, {
    method: 'PATCH',
    headers,
    body: {
      cutoffTime: '16:30',
      cutoffWorkingDaysCount: 2,
      dispatchBufferMinutes: 35,
    },
  });
  assert(updateSettingsRes.status === 200, 'Kitchen settings updated successfully');
  assert(updateSettingsRes.data.cutoffTime === '16:30', 'Cutoff time persisted as 16:30');
  assert(updateSettingsRes.data.dispatchBufferMinutes === 35, 'Dispatch buffer persisted as 35 min');

  // Kitchen Working Days
  const workingDaysRes = await request(`${API_BASE}/settings/kitchen/working-days`, { headers });
  assert(workingDaysRes.status === 200, 'Kitchen working days fetched');

  // Add kitchen holiday
  const holidayName = `Audit Holiday ${timestamp}`;
  const addHolidayRes = await request(`${API_BASE}/settings/kitchen/holidays`, {
    method: 'POST',
    headers,
    body: {
      name: holidayName,
      date: '2026-12-25',
    },
  });
  assert(addHolidayRes.status === 201, 'Kitchen holiday added with status 201');
  const createdHoliday = addHolidayRes.data;

  // Delete holiday
  const delHolidayRes = await request(`${API_BASE}/settings/kitchen/holidays/${createdHoliday.id}`, {
    method: 'DELETE',
    headers,
  });
  assert(delHolidayRes.status === 200, 'Kitchen holiday deleted successfully');

  // Revert settings to standard 16:00
  await request(`${API_BASE}/settings/kitchen`, {
    method: 'PATCH',
    headers,
    body: {
      cutoffTime: '16:00',
      cutoffWorkingDaysCount: 2,
      dispatchBufferMinutes: 30,
    },
  });

  console.log('\n================================================================');
  console.log('✅ ALL PHASE 13 ADMIN FUNCTIONAL AUDIT CHECKS PASSED PERFECTLY!');
  console.log('================================================================\n');
}

runPhase13AdminAudit().catch((err) => {
  console.error('Fatal error during audit:', err);
  process.exit(1);
});
