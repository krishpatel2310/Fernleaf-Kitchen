import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import * as http from 'http';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { PrismaClient, OrderStatus, OrderEventType } from '@prisma/client';

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

async function runLiveVerification() {
  console.log('====================================================');
  console.log('PHASE 6 LIVE HTTP API VERIFICATION SUITE');
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
    console.log('✔ Test NestJS backend listening on http://localhost:4001/api\n');
  } catch (err) {
    console.error('Failed to start test NestJS application:', err);
    process.exit(1);
  }

  let totalTests = 0;
  let passedTests = 0;

  function assertTest(condition: boolean, testName: string, detail?: string) {
    totalTests++;
    if (condition) {
      passedTests++;
      console.log(`  [PASS] ${testName}`);
    } else {
      console.error(`  [FAIL] ${testName}${detail ? ` -> ${detail}` : ''}`);
    }
  }

  try {
    // ----------------------------------------------------
    // 1. AUTHENTICATION & RBAC
    // ----------------------------------------------------
    console.log('--- 1. Authentication & RBAC ---');

    // Admin login
    const adminLoginRes = await makeRequest({
      method: 'POST',
      path: '/api/auth/login',
      body: { email: 'admin@test.com', password: 'Test@1234' },
    });
    assertTest(adminLoginRes.status === 200, 'Admin login returns 200 OK');
    const adminToken = adminLoginRes.data?.accessToken;
    assertTest(!!adminToken, 'Admin receives JWT access token');
    const adminAuthHeader = { Authorization: `Bearer ${adminToken}` };

    // Driver login
    const driverLoginRes = await makeRequest({
      method: 'POST',
      path: '/api/auth/login',
      body: { email: 'driver@test.com', password: 'Test@1234' },
    });
    assertTest(driverLoginRes.status === 200, 'Driver login returns 200 OK');
    const driverToken = driverLoginRes.data?.accessToken;
    const driverAuthHeader = { Authorization: `Bearer ${driverToken}` };

    // Unauthenticated GET /api/orders
    const unauthRes = await makeRequest({
      method: 'GET',
      path: '/api/orders',
    });
    assertTest(unauthRes.status === 401, 'Unauthenticated request to GET /api/orders returns 401 Unauthorized');

    // Driver GET /api/orders (Driver does not have orders.read permission)
    const driverOrdersRes = await makeRequest({
      method: 'GET',
      path: '/api/orders',
      headers: driverAuthHeader,
    });
    assertTest(driverOrdersRes.status === 403, 'Driver accessing GET /api/orders returns 403 Forbidden');

    // Admin GET /api/orders
    const adminOrdersRes = await makeRequest({
      method: 'GET',
      path: '/api/orders',
      headers: adminAuthHeader,
    });
    assertTest(adminOrdersRes.status === 200, 'Admin accessing GET /api/orders returns 200 OK');
    assertTest(Array.isArray(adminOrdersRes.data?.items), 'Response contains paginated items array');
    assertTest(typeof adminOrdersRes.data?.total === 'number', 'Response contains total count');

    // ----------------------------------------------------
    // 2. FETCH REFERENCE DATA FROM DATABASE
    // ----------------------------------------------------
    console.log('\n--- 2. Fetch Reference Data ---');

    const empRajesh = await prisma.employee.findUnique({
      where: { email: 'rajesh.sharma@apextech.io' },
      include: { company: true },
    });
    const empPriya = await prisma.employee.findUnique({
      where: { email: 'priya.patel@apextech.io' },
    });
    const empAmit = await prisma.employee.findUnique({
      where: { email: 'amit.verma@apextech.io' },
    });
    const empAnanya = await prisma.employee.findUnique({
      where: { email: 'ananya.rao@summithealth.co' },
      include: { company: true },
    });

    const dishSalad = await prisma.dish.findUnique({
      where: { sku: 'SKU-SMK-SALAD' },
      include: {
        optionGroups: {
          include: {
            optionGroup: {
              include: {
                options: { include: { option: true } },
                portions: { include: { portionSize: true } },
              },
            },
          },
        },
      },
    });

    const dishBowl = await prisma.dish.findUnique({
      where: { sku: 'SKU-PNR-BOWL' },
      include: {
        optionGroups: {
          include: {
            optionGroup: {
              include: {
                options: { include: { option: true } },
                portions: { include: { portionSize: true } },
              },
            },
          },
        },
      },
    });

    const apexHQAddress = await prisma.companyAddress.findFirst({
      where: { label: 'Apex Tower HQ' },
    });
    const apexWhitefieldAddress = await prisma.companyAddress.findFirst({
      where: { label: 'Apex Whitefield Campus' },
    });
    const packagingEco = await prisma.packagingType.findFirst({
      where: { name: 'Standard Eco Box' },
    });

    assertTest(!!empRajesh && !!dishSalad && !!dishBowl, 'Found seeded employees and dishes');

    const dressingGroup = dishSalad!.optionGroups[0]?.optionGroup;
    const honeyMustardOpt = dressingGroup?.options[0]?.option;
    const oliveOilOpt = dressingGroup?.options[1]?.option;

    const bowlAddonGroup = dishBowl!.optionGroups[0]?.optionGroup;
    const portionRegular = bowlAddonGroup?.portions[0]?.portionSize;
    const portionLarge = bowlAddonGroup?.portions[1]?.portionSize;
    const avocadoOpt = bowlAddonGroup?.options.find((o) => o.option.name === 'Avocado Salsa')?.option;

    // ----------------------------------------------------
    // 3. ORDER CREATION VALIDATION RULES
    // ----------------------------------------------------
    console.log('\n--- 3. Order Creation Validation Rules ---');

    // A. Combination quantity mismatch (Dish qty = 3, combo sum = 2)
    const comboMismatchRes = await makeRequest({
      method: 'POST',
      path: '/api/orders',
      headers: adminAuthHeader,
      body: {
        employeeId: empRajesh!.id,
        deliveryDate: '2026-10-14',
        lines: [
          {
            dishId: dishSalad!.id,
            quantity: 3,
            combinations: [
              {
                quantity: 2, // Total = 2 != 3
                options: [
                  {
                    optionGroupId: dressingGroup!.id,
                    optionId: honeyMustardOpt!.id,
                  },
                ],
              },
            ],
          },
        ],
      },
    });
    assertTest(
      comboMismatchRes.status === 400 &&
        JSON.stringify(comboMismatchRes.data).toLowerCase().includes('combination quantities'),
      'Combination quantity mismatch rejected with 400 Bad Request',
      JSON.stringify(comboMismatchRes.data),
    );

    // B. Required option group omitted
    const missingRequiredGroupRes = await makeRequest({
      method: 'POST',
      path: '/api/orders',
      headers: adminAuthHeader,
      body: {
        employeeId: empRajesh!.id,
        deliveryDate: '2026-10-14',
        lines: [
          {
            dishId: dishSalad!.id,
            quantity: 2,
            combinations: [
              {
                quantity: 2,
                options: [], // Missing required Dressing Choice
              },
            ],
          },
        ],
      },
    });
    assertTest(
      missingRequiredGroupRes.status === 400 &&
        JSON.stringify(missingRequiredGroupRes.data).includes('Required option group'),
      'Missing required option group rejected with 400 Bad Request',
      JSON.stringify(missingRequiredGroupRes.data),
    );

    // C. Invalid option not belonging to group
    const invalidOptionRes = await makeRequest({
      method: 'POST',
      path: '/api/orders',
      headers: adminAuthHeader,
      body: {
        employeeId: empRajesh!.id,
        deliveryDate: '2026-10-14',
        lines: [
          {
            dishId: dishSalad!.id,
            quantity: 1,
            combinations: [
              {
                quantity: 1,
                options: [
                  {
                    optionGroupId: dressingGroup!.id,
                    optionId: avocadoOpt!.id, // Avocado belongs to Bowl, not Dressing!
                  },
                ],
              },
            ],
          },
        ],
      },
    });
    assertTest(
      invalidOptionRes.status === 400,
      'Option not belonging to option group rejected with 400 Bad Request',
      JSON.stringify(invalidOptionRes.data),
    );

    // D. Company delivery holiday rejected
    // Summit Health holiday: 2026-10-02 (Gandhi Jayanti)
    const holidayRes = await makeRequest({
      method: 'POST',
      path: '/api/orders',
      headers: adminAuthHeader,
      body: {
        employeeId: empAnanya!.id,
        deliveryDate: '2026-10-02',
        lines: [
          {
            dishId: dishBowl!.id,
            quantity: 1,
            combinations: [
              {
                quantity: 1,
                options: [
                  {
                    optionGroupId: bowlAddonGroup!.id,
                    optionId: avocadoOpt!.id,
                    portionSizeId: portionRegular!.id,
                  },
                ],
              },
            ],
          },
        ],
      },
    });
    assertTest(
      holidayRes.status === 400 &&
        JSON.stringify(holidayRes.data).includes('cannot receive delivery'),
      'Order on company holiday rejected with 400 Bad Request',
      JSON.stringify(holidayRes.data),
    );

    // E. Company hidden dish rejected
    // Smoked Chicken Salad is hidden for Summit Health
    const hiddenDishRes = await makeRequest({
      method: 'POST',
      path: '/api/orders',
      headers: adminAuthHeader,
      body: {
        employeeId: empAnanya!.id,
        deliveryDate: '2026-10-14',
        lines: [
          {
            dishId: dishSalad!.id, // hidden for Summit Health
            quantity: 1,
            combinations: [
              {
                quantity: 1,
                options: [
                  {
                    optionGroupId: dressingGroup!.id,
                    optionId: honeyMustardOpt!.id,
                  },
                ],
              },
            ],
          },
        ],
      },
    });
    assertTest(
      hiddenDishRes.status === 400 &&
        JSON.stringify(hiddenDishRes.data).includes('not available'),
      'Company-hidden dish rejected with 400 Bad Request',
      JSON.stringify(hiddenDishRes.data),
    );

    // F. Minimum Order Quantity (MOQ) validation
    await prisma.dish.update({
      where: { id: dishBowl!.id },
      data: { minimumOrderQuantity: 5 },
    });
    const moqRes = await makeRequest({
      method: 'POST',
      path: '/api/orders',
      headers: adminAuthHeader,
      body: {
        employeeId: empRajesh!.id,
        deliveryDate: '2026-10-14',
        lines: [
          {
            dishId: dishBowl!.id,
            quantity: 3, // Below MOQ = 5
            combinations: [
              {
                quantity: 3,
                options: [
                  {
                    optionGroupId: bowlAddonGroup!.id,
                    optionId: avocadoOpt!.id,
                    portionSizeId: portionRegular!.id,
                  },
                ],
              },
            ],
          },
        ],
      },
    });
    assertTest(
      moqRes.status === 400 &&
        JSON.stringify(moqRes.data).includes('minimum order quantity'),
      'Quantity below dish MOQ rejected with 400 Bad Request',
      JSON.stringify(moqRes.data),
    );
    // Reset MOQ
    await prisma.dish.update({
      where: { id: dishBowl!.id },
      data: { minimumOrderQuantity: null },
    });

    // G. Employee permission violation (canChooseDeliveryAddress: false)
    const permAddressRes = await makeRequest({
      method: 'POST',
      path: '/api/orders',
      headers: adminAuthHeader,
      body: {
        employeeId: empAmit!.id, // canChooseDeliveryAddress: false
        deliveryDate: '2026-10-14',
        companyAddressId: apexHQAddress!.id, // Attempting to select address
        lines: [
          {
            dishId: dishSalad!.id,
            quantity: 1,
            combinations: [
              {
                quantity: 1,
                options: [
                  {
                    optionGroupId: dressingGroup!.id,
                    optionId: honeyMustardOpt!.id,
                  },
                ],
              },
            ],
          },
        ],
      },
    });
    assertTest(
      permAddressRes.status === 400 &&
        JSON.stringify(permAddressRes.data).includes('permission to choose'),
      'Employee without address permission rejected when supplying address',
      JSON.stringify(permAddressRes.data),
    );

    // H. Employee permission violation (canChangeDeliveryTime: false)
    const permTimeRes = await makeRequest({
      method: 'POST',
      path: '/api/orders',
      headers: adminAuthHeader,
      body: {
        employeeId: empPriya!.id, // canChangeDeliveryTime: false
        deliveryDate: '2026-10-14',
        deliveryTimeMinutes: 800, // Attempting to change delivery time
        lines: [
          {
            dishId: dishSalad!.id,
            quantity: 1,
            combinations: [
              {
                quantity: 1,
                options: [
                  {
                    optionGroupId: dressingGroup!.id,
                    optionId: honeyMustardOpt!.id,
                  },
                ],
              },
            ],
          },
        ],
      },
    });
    assertTest(
      permTimeRes.status === 400 &&
        JSON.stringify(permTimeRes.data).includes('permission to change delivery time'),
      'Employee without delivery time permission rejected when supplying time',
      JSON.stringify(permTimeRes.data),
    );

    // ----------------------------------------------------
    // 4. VALID ORDER CREATION & COMBINATION NORMALIZATION
    // ----------------------------------------------------
    console.log('\n--- 4. Valid Order Creation & Pricing ---');

    // Create a valid PLACED order with multiple combinations and identical combination normalization
    // Dish: Salad (Apex price tier = Enterprise Gold: dish 750¢, honey mustard 40¢, olive oil 30¢)
    // Combinations:
    // Combo 1: qty 2 with Honey Mustard (unitPrice = 750 + 40 = 790¢, total = 1580¢)
    // Combo 2: qty 1 with Olive Oil (unitPrice = 750 + 30 = 780¢, total = 780¢)
    // Combo 3 (duplicate of Combo 1): qty 1 with Honey Mustard
    // Total line quantity = 4.
    // Normalized: Combo 1 will have qty 3, Combo 2 will have qty 1.
    // Expected Total = (3 * 790) + (1 * 780) = 2370 + 780 = 3150¢ ($31.50)
    const validCreateRes = await makeRequest({
      method: 'POST',
      path: '/api/orders',
      headers: adminAuthHeader,
      body: {
        employeeId: empRajesh!.id,
        deliveryDate: '2026-10-14',
        isPlaced: true,
        deliveryAddressId: apexHQAddress!.id,
        packagingTypeId: packagingEco!.id,
        deliveryTimeMinutes: 750,
        lines: [
          {
            dishId: dishSalad!.id,
            quantity: 4,
            combinations: [
              {
                quantity: 2,
                options: [
                  {
                    optionGroupId: dressingGroup!.id,
                    optionId: honeyMustardOpt!.id,
                  },
                ],
              },
              {
                quantity: 1,
                options: [
                  {
                    optionGroupId: dressingGroup!.id,
                    optionId: oliveOilOpt!.id,
                  },
                ],
              },
              {
                quantity: 1, // Duplicate of first combination! Should be merged
                options: [
                  {
                    optionGroupId: dressingGroup!.id,
                    optionId: honeyMustardOpt!.id,
                  },
                ],
              },
            ],
          },
        ],
      },
    });

    assertTest(validCreateRes.status === 201, 'Valid order created with 201 Created');
    const createdOrder = validCreateRes.data;
    assertTest(createdOrder?.status === OrderStatus.PLACED, 'Order status is PLACED');
    assertTest(createdOrder?.totalCents === 3150, `Order total is calculated correctly (3150¢ = $31.50), got ${createdOrder?.totalCents}`);

    const saladLine = createdOrder?.lines?.[0];
    assertTest(saladLine?.combinations?.length === 2, `Identical combinations normalized to 2 distinct units, got ${saladLine?.combinations?.length}`);
    const normalizedCombo1 = saladLine?.combinations?.find((c: any) => c.unitPriceCents === 790);
    assertTest(normalizedCombo1?.quantity === 3, `Normalized combination quantity correctly merged (2 + 1 = 3), got ${normalizedCombo1?.quantity}`);

    // Verify historical snapshot values
    assertTest(saladLine?.dishNameSnapshot === dishSalad!.name, 'Dish name is snapshotted');
    assertTest(saladLine?.dishSkuSnapshot === dishSalad!.sku, 'Dish SKU is snapshotted');
    assertTest(saladLine?.dishUnitPriceCents === 750, 'Dish price is snapshotted at company tier (750¢)');
    assertTest(createdOrder?.delivery?.addressLabelSnapshot === 'Apex Tower HQ', 'Delivery address label snapshotted');

    // ----------------------------------------------------
    // 5. HISTORICAL SNAPSHOT IMMUTABILITY
    // ----------------------------------------------------
    console.log('\n--- 5. Historical Snapshot Immutability ---');

    // Mutate the original dish name and tier price in the database
    await prisma.dish.update({
      where: { id: dishSalad!.id },
      data: { name: 'MUTATED FUTURE DISH NAME' },
    });

    // Re-fetch the previously created order
    const orderDetailRes = await makeRequest({
      method: 'GET',
      path: `/api/orders/${createdOrder.id}`,
      headers: adminAuthHeader,
    });
    const fetchedDetail = orderDetailRes.data;
    assertTest(
      fetchedDetail?.lines?.[0]?.dishNameSnapshot === dishSalad!.name,
      'Historical order snapshot is unaffected by subsequent catalogue changes',
      `Snapshot is: ${fetchedDetail?.lines?.[0]?.dishNameSnapshot}`,
    );

    // Restore dish name
    await prisma.dish.update({
      where: { id: dishSalad!.id },
      data: { name: dishSalad!.name },
    });

    // ----------------------------------------------------
    // 6. HISTORICAL COMPANY SAFETY (EMPLOYEE MOVES A -> B)
    // ----------------------------------------------------
    console.log('\n--- 6. Historical Company Safety ---');

    // Create a temporary employee under Apex
    const tempEmp = await prisma.employee.create({
      data: {
        companyId: empRajesh!.companyId,
        firstName: 'Transfer',
        lastName: 'TestUser',
        email: `transfer-${Date.now()}@apextech.io`,
        canChooseDeliveryAddress: true,
        canChangeDeliveryTime: true,
        canChangePackaging: true,
      },
    });

    // Create an order for this employee under Apex
    const tempOrderRes = await makeRequest({
      method: 'POST',
      path: '/api/orders',
      headers: adminAuthHeader,
      body: {
        employeeId: tempEmp.id,
        deliveryDate: '2026-10-14',
        isPlaced: true,
        lines: [
          {
            dishId: dishSalad!.id,
            quantity: 1,
            combinations: [
              {
                quantity: 1,
                options: [
                  {
                    optionGroupId: dressingGroup!.id,
                    optionId: honeyMustardOpt!.id,
                  },
                ],
              },
            ],
          },
        ],
      },
    });
    const tempOrderId = tempOrderRes.data?.id;
    const initialCompanyId = tempOrderRes.data?.companyId;
    assertTest(initialCompanyId === empRajesh!.companyId, 'Order initial companyId is Apex');

    // Move employee to Summit Health
    const summitCompany = empAnanya!.company;
    await prisma.employee.update({
      where: { id: tempEmp.id },
      data: { companyId: summitCompany.id },
    });

    // Fetch the order again
    const verifyMoveRes = await makeRequest({
      method: 'GET',
      path: `/api/orders/${tempOrderId}`,
      headers: adminAuthHeader,
    });
    assertTest(
      verifyMoveRes.data?.companyId === initialCompanyId,
      'Order retains historical companyId after employee transfer to new company',
    );

    // Clean up temp data
    await prisma.order.delete({ where: { id: tempOrderId } });
    await prisma.employee.delete({ where: { id: tempEmp.id } });

    // ----------------------------------------------------
    // 7. CUTOFF PROCESSING & IDEMPOTENCY
    // ----------------------------------------------------
    console.log('\n--- 7. Cutoff Processing & Idempotency ---');

    // Create a past-cutoff draft order and past-cutoff placed order directly in database
    // Past delivery date: 2026-09-15
    const pastDeliveryDate = new Date('2026-09-15T00:00:00.000Z');

    const pastDraftOrder = await prisma.order.create({
      data: {
        orderNumber: `TEST-CUTOFF-DRAFT-${Date.now()}`,
        employeeId: empRajesh!.id,
        companyId: empRajesh!.companyId,
        deliveryDate: pastDeliveryDate,
        deliveryTimeMinutes: 750,
        packagingTypeId: packagingEco!.id,
        status: OrderStatus.DRAFT,
        totalCents: 790,
      },
    });

    const pastPlacedOrder = await prisma.order.create({
      data: {
        orderNumber: `TEST-CUTOFF-PLACED-${Date.now()}`,
        employeeId: empRajesh!.id,
        companyId: empRajesh!.companyId,
        deliveryDate: pastDeliveryDate,
        deliveryTimeMinutes: 750,
        packagingTypeId: packagingEco!.id,
        status: OrderStatus.PLACED,
        totalCents: 790,
        placedAt: new Date('2026-09-10T10:00:00.000Z'),
      },
    });

    // Driver attempts to trigger cutoff -> 403 Forbidden
    const driverCutoffRes = await makeRequest({
      method: 'POST',
      path: '/api/orders/process-cutoffs',
      headers: driverAuthHeader,
    });
    assertTest(driverCutoffRes.status === 403, 'Driver cannot trigger cutoff processing (403 Forbidden)');

    // Admin triggers cutoff processing
    const cutoffRes1 = await makeRequest({
      method: 'POST',
      path: '/api/orders/process-cutoffs',
      headers: adminAuthHeader,
    });
    assertTest(cutoffRes1.status === 200, 'Admin can trigger manual cutoff processing (200 OK)');
    assertTest(cutoffRes1.data?.cancelledDraftsCount >= 1, `Past draft orders cancelled: ${cutoffRes1.data?.cancelledDraftsCount}`);
    assertTest(cutoffRes1.data?.confirmedCount >= 1, `Past placed orders confirmed: ${cutoffRes1.data?.confirmedCount}`);

    // Verify database state of our test orders
    const updatedDraft = await prisma.order.findUnique({ where: { id: pastDraftOrder.id } });
    const updatedPlaced = await prisma.order.findUnique({ where: { id: pastPlacedOrder.id } });
    assertTest(updatedDraft?.status === OrderStatus.CANCELLED, 'Past draft order transitioned to CANCELLED');
    assertTest(updatedPlaced?.status === OrderStatus.CONFIRMED, 'Past placed order transitioned to CONFIRMED');

    // Run cutoff processing a second time immediately to verify IDEMPOTENCY
    const cutoffRes2 = await makeRequest({
      method: 'POST',
      path: '/api/orders/process-cutoffs',
      headers: adminAuthHeader,
    });
    assertTest(cutoffRes2.status === 200, 'Repeated cutoff processing returns 200 OK');
    assertTest(
      cutoffRes2.data?.cancelledDraftsCount === 0 && cutoffRes2.data?.confirmedCount === 0,
      'Second cutoff processing run is completely idempotent (0 changes)',
    );

    // Verify no duplicate events were created
    const placedEvents = await prisma.orderEvent.findMany({
      where: { orderId: pastPlacedOrder.id, type: OrderEventType.ORDER_CONFIRMED },
    });
    assertTest(placedEvents.length === 1, `Exactly 1 CONFIRMED timeline event created, got ${placedEvents.length}`);

    // Clean up cutoff test orders
    await prisma.order.delete({ where: { id: pastDraftOrder.id } });
    await prisma.order.delete({ where: { id: pastPlacedOrder.id } });

    // ----------------------------------------------------
    // 8. ADMIN OVERRIDE
    // ----------------------------------------------------
    console.log('\n--- 8. Admin Overrides ---');

    // Find confirmed order FK-2026-0002
    const confirmedOrder = await prisma.order.findUnique({
      where: { orderNumber: 'FK-2026-0002' },
      include: { delivery: true },
    });
    assertTest(!!confirmedOrder, 'Found seeded confirmed order FK-2026-0002');

    // Driver attempts to override delivery details -> 403 Forbidden
    const driverOverrideRes = await makeRequest({
      method: 'POST',
      path: `/api/orders/${confirmedOrder!.id}/override`,
      headers: driverAuthHeader,
      body: {
        deliveryAddressId: apexWhitefieldAddress!.id,
        note: 'Unauthorized driver attempt',
      },
    });
    assertTest(driverOverrideRes.status === 403, 'Driver cannot override order delivery details (403 Forbidden)');

    // Admin overrides delivery address to Whitefield campus
    const adminOverrideRes = await makeRequest({
      method: 'POST',
      path: `/api/orders/${confirmedOrder!.id}/override`,
      headers: adminAuthHeader,
      body: {
        deliveryAddressId: apexWhitefieldAddress!.id,
        deliveryTimeMinutes: 780, // Changed to 1:00 PM
        note: 'Executive relocated meeting to Whitefield Campus',
      },
    });
    assertTest(adminOverrideRes.status === 200, 'Admin override succeeds with 200 OK');
    assertTest(
      adminOverrideRes.data?.delivery?.addressLabelSnapshot === 'Apex Whitefield Campus',
      'Overridden address label updated to Apex Whitefield Campus',
    );
    assertTest(
      adminOverrideRes.data?.deliveryTimeMinutes === 780,
      'Overridden delivery time updated to 780 (1:00 PM)',
    );

    // Verify order timeline includes the ADMIN_OVERRIDE event
    const timelineRes = await makeRequest({
      method: 'GET',
      path: `/api/orders/${confirmedOrder!.id}/timeline`,
      headers: adminAuthHeader,
    });
    assertTest(timelineRes.status === 200, 'Timeline retrieval returns 200 OK');
    const overrideEvent = timelineRes.data?.find((e: any) => e.type === OrderEventType.ADMIN_OVERRIDE);
    assertTest(!!overrideEvent, 'Timeline contains ADMIN_OVERRIDE event');
    assertTest(
      overrideEvent?.note === 'Executive relocated meeting to Whitefield Campus',
      'Timeline recorded admin override note correctly',
    );

    // ----------------------------------------------------
    // 9. ORDER LIST FILTERS & PAGINATION
    // ----------------------------------------------------
    console.log('\n--- 9. Order List Filters & Server-Side Pagination ---');

    // Filter by status=CONFIRMED
    const filterStatusRes = await makeRequest({
      method: 'GET',
      path: '/api/orders?status=CONFIRMED',
      headers: adminAuthHeader,
    });
    assertTest(filterStatusRes.status === 200, 'Filter by status returns 200 OK');
    const allConfirmed = filterStatusRes.data?.items?.every((o: any) => o.status === OrderStatus.CONFIRMED);
    assertTest(allConfirmed, 'All filtered items have status CONFIRMED');

    // Filter by company
    const filterCompanyRes = await makeRequest({
      method: 'GET',
      path: `/api/orders?companyId=${empRajesh!.companyId}`,
      headers: adminAuthHeader,
    });
    assertTest(filterCompanyRes.status === 200, 'Filter by companyId returns 200 OK');
    const allCompany = filterCompanyRes.data?.items?.every((o: any) => o.companyId === empRajesh!.companyId);
    assertTest(allCompany, 'All filtered items belong to requested company');

    // Pagination limit & page
    const pageLimitRes = await makeRequest({
      method: 'GET',
      path: '/api/orders?page=1&limit=2',
      headers: adminAuthHeader,
    });
    assertTest(pageLimitRes.status === 200, 'Pagination query returns 200 OK');
    assertTest(pageLimitRes.data?.items?.length <= 2, `Page contains at most 2 items, got ${pageLimitRes.data?.items?.length}`);
    assertTest(pageLimitRes.data?.limit === 2, 'Page limit metadata is 2');

    // Clean up created test order
    if (createdOrder?.id) {
      await prisma.order.delete({ where: { id: createdOrder.id } });
    }

  } catch (error) {
    console.error('Unexpected error during verification:', error);
  } finally {
    if (app!) {
      await app.close();
      console.log('\n✔ Test server closed');
    }
    await prisma.$disconnect();
  }

  console.log('\n====================================================');
  console.log(`VERIFICATION SUMMARY: ${passedTests} / ${totalTests} TESTS PASSED`);
  console.log('====================================================');

  if (passedTests === totalTests && totalTests > 0) {
    console.log('\n🎉 ALL PHASE 6 VERIFICATIONS PASSED SUCCESSFULLY!\n');
    process.exit(0);
  } else {
    console.error(`\n❌ VERIFICATION FAILED: ${totalTests - passedTests} tests failed.\n`);
    process.exit(1);
  }
}

runLiveVerification();
