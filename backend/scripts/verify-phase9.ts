import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import * as http from 'http';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { PrismaClient, InvoiceStatus, OrderStatus } from '@prisma/client';

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
        port: 4003,
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
  console.log('PHASE 9 LIVE HTTP API VERIFICATION SUITE — BILLING');
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
    await app.listen(4003);
    console.log('🚀 Test server started on http://localhost:4003/api\n');

    // -------------------------------------------------------------
    // 1-4. Authenticate Accounts
    // -------------------------------------------------------------
    console.log('1-4. Authenticating accounts...');
    const accounts = [
      { role: 'admin', email: 'admin@test.com', pass: 'Test@1234' },
      { role: 'kitchen', email: 'kitchen@test.com', pass: 'Test@1234' },
      { role: 'dispatch', email: 'dispatch@test.com', pass: 'Test@1234' },
      { role: 'driver', email: 'driver@test.com', pass: 'Test@1234' },
    ];

    const tokens: Record<string, string> = {};
    for (const acc of accounts) {
      const res = await makeRequest({
        method: 'POST',
        path: '/api/auth/login',
        body: { email: acc.email, password: acc.pass },
      });
      assert(res.status === 200, `Login succeeded for ${acc.email} (status: 200)`);
      assert(!!res.data?.accessToken, `Access token returned for ${acc.email}`);
      tokens[acc.role] = res.data.accessToken;
    }

    // -------------------------------------------------------------
    // 5. Verify Unauthorized Access & Role Boundaries (RBAC)
    // -------------------------------------------------------------
    console.log('\n5. Verifying Unauthorized Access & Role Boundaries...');
    const unauthList = await makeRequest({
      method: 'GET',
      path: '/api/billing/invoices',
    });
    assert(unauthList.status === 401, 'Unauthenticated GET /api/billing/invoices rejected with 401');

    const unauthCreate = await makeRequest({
      method: 'POST',
      path: '/api/billing/invoices',
      body: { companyId: 'dummy', orderIds: ['dummy'] },
    });
    assert(unauthCreate.status === 401, 'Unauthenticated POST /api/billing/invoices rejected with 401');

    for (const nonAdmin of ['kitchen', 'dispatch', 'driver']) {
      const getRes = await makeRequest({
        method: 'GET',
        path: '/api/billing/invoices',
        headers: authHeaders(tokens[nonAdmin]),
      });
      assert(
        getRes.status === 403,
        `${nonAdmin.toUpperCase()} role forbidden from GET /api/billing/invoices (403)`,
      );

      const postRes = await makeRequest({
        method: 'POST',
        path: '/api/billing/invoices',
        headers: authHeaders(tokens[nonAdmin]),
        body: { companyId: 'dummy', orderIds: ['dummy'] },
      });
      assert(
        postRes.status === 403,
        `${nonAdmin.toUpperCase()} role forbidden from POST /api/billing/invoices (403)`,
      );

      const payRes = await makeRequest({
        method: 'POST',
        path: '/api/billing/invoices/dummy/mark-paid',
        headers: authHeaders(tokens[nonAdmin]),
      });
      assert(
        payRes.status === 403,
        `${nonAdmin.toUpperCase()} role forbidden from marking invoice paid (403)`,
      );
    }

    // -------------------------------------------------------------
    // 6. Verify Billing Read Access with Admin
    // -------------------------------------------------------------
    console.log('\n6. Inspecting Invoices List & Uninvoiced Orders with Admin...');
    const listRes = await makeRequest({
      method: 'GET',
      path: '/api/billing/invoices',
      headers: authHeaders(tokens.admin),
    });
    assert(listRes.status === 200, 'Admin GET /api/billing/invoices returned 200');
    assert(Array.isArray(listRes.data?.data), 'Invoices list returns paginated data array');
    assert(listRes.data?.meta?.total >= 3, `Invoices count is at least 3 (total: ${listRes.data?.meta?.total})`);

    const uninvoicedRes = await makeRequest({
      method: 'GET',
      path: '/api/billing/uninvoiced-orders',
      headers: authHeaders(tokens.admin),
    });
    assert(uninvoicedRes.status === 200, 'Admin GET /api/billing/uninvoiced-orders returned 200');
    assert(Array.isArray(uninvoicedRes.data), 'Returns array of confirmed uninvoiced orders');

    // -------------------------------------------------------------
    // 7. Verify Seeded Invoices State (Unpaid, Paid, and Mismatch)
    // -------------------------------------------------------------
    console.log('\n7. Verifying Seeded Invoices...');
    const inv1InList = listRes.data.data.find((i: any) => i.invoiceNumber === 'INV-2026-0001');
    assert(!!inv1InList, 'INV-2026-0001 found in invoice list');
    assert(inv1InList.status === InvoiceStatus.ISSUED, 'INV-2026-0001 status is ISSUED (unpaid)');
    assert(inv1InList.totalCents === 4000, 'INV-2026-0001 total is exactly 4000¢');
    assert(inv1InList.orderCount === 2, 'INV-2026-0001 contains 2 orders');

    const inv2InList = listRes.data.data.find((i: any) => i.invoiceNumber === 'INV-2026-0002');
    assert(!!inv2InList, 'INV-2026-0002 found in invoice list');
    assert(inv2InList.status === InvoiceStatus.PAID, 'INV-2026-0002 status is PAID');
    assert(!!inv2InList.paidAt, 'INV-2026-0002 has non-null paidAt timestamp');

    // Detailed check of INV-2026-0003 (Mismatch demonstration)
    const inv3Summary = listRes.data.data.find((i: any) => i.invoiceNumber === 'INV-2026-0003');
    assert(!!inv3Summary, 'INV-2026-0003 found in invoice list');
    assert(inv3Summary.hasAdjustments === true, 'INV-2026-0003 flags hasAdjustments = true');

    const inv3DetailRes = await makeRequest({
      method: 'GET',
      path: `/api/billing/invoices/${inv3Summary.id}`,
      headers: authHeaders(tokens.admin),
    });
    assert(inv3DetailRes.status === 200, 'GET /api/billing/invoices/:id returned 200 for INV-2026-0003');
    const inv3Detail = inv3DetailRes.data;
    assert(inv3Detail.totalCents === 1600, 'INV-2026-0003 preserved historical invoiced snapshot total of 1600¢');
    assert(inv3Detail.orders[0].invoicedAmountCents === 1600, 'Order snapshot invoicedAmountCents is 1600¢');
    assert(inv3Detail.orders[0].currentOrderTotalCents === 2000, 'Order currentOrderTotalCents is 2000¢');
    assert(inv3Detail.orders[0].hasAmountMismatch === true, 'hasAmountMismatch is true');
    assert(inv3Detail.orders[0].amountDifferenceCents === 400, 'amountDifferenceCents is +400¢');
    assert(inv3Detail.orders[0].adjustmentRequired === true, 'adjustmentRequired is true');
    assert(inv3Detail.hasAdjustments === true, 'Invoice hasAdjustments is true');
    assert(inv3Detail.totalAdjustmentDifferenceCents === 400, 'totalAdjustmentDifferenceCents is +400¢');

    // -------------------------------------------------------------
    // 8. Verify Invoice Creation from Confirmed Uninvoiced Orders
    // -------------------------------------------------------------
    console.log('\n8. Verifying Invoice Creation Flow...');
    const summitComp = await prisma.company.findFirst({ where: { name: 'Summit Health Innovations' } });
    assert(!!summitComp, 'Summit Health Innovations found in database');

    const orderB001 = await prisma.order.findUnique({ where: { orderNumber: 'FK-2026-B001' } });
    const orderB002 = await prisma.order.findUnique({ where: { orderNumber: 'FK-2026-B002' } });
    assert(!!orderB001 && !!orderB002, 'Confirmed uninvoiced orders FK-2026-B001 and FK-2026-B002 exist in DB');

    const createInvRes = await makeRequest({
      method: 'POST',
      path: '/api/billing/invoices',
      headers: authHeaders(tokens.admin),
      body: {
        companyId: summitComp!.id,
        orderIds: [orderB001!.id, orderB002!.id],
        notes: 'Live verification test invoice for Summit',
      },
    });
    assert(createInvRes.status === 201, 'POST /api/billing/invoices returned 201 Created');
    const createdInv = createInvRes.data;
    assert(createdInv.status === InvoiceStatus.ISSUED, 'Created invoice has status ISSUED');
    assert(createdInv.companyId === summitComp!.id, 'Created invoice belongs to Summit Health');
    assert(createdInv.orderCount === 2, 'Created invoice contains exactly 2 orders');
    const expectedTotal = orderB001!.totalCents + orderB002!.totalCents;
    assert(createdInv.totalCents === expectedTotal, `Created invoice total is exactly sum of orders: ${expectedTotal}¢ (1500 + 2500)`);
    assert(Number.isInteger(createdInv.totalCents), 'Invoice total is strictly integer minor units');

    // -------------------------------------------------------------
    // 9. Verify Order Eligibility Rules & Invariants
    // -------------------------------------------------------------
    console.log('\n9. Verifying Order Eligibility Invariants...');
    const draftOrder = await prisma.order.findUnique({ where: { orderNumber: 'FK-2026-0004' } });
    const placedOrder = await prisma.order.findUnique({ where: { orderNumber: 'FK-2026-0003' } });
    const cancelledOrder = await prisma.order.findUnique({ where: { orderNumber: 'FK-2026-0005' } });
    const rejectedOrder = await prisma.order.findUnique({ where: { orderNumber: 'FK-2026-0006' } });
    const apexComp = await prisma.company.findFirst({ where: { name: 'Apex Technologies Ltd' } });

    // DRAFT rejected
    const draftRes = await makeRequest({
      method: 'POST',
      path: '/api/billing/invoices',
      headers: authHeaders(tokens.admin),
      body: { companyId: apexComp!.id, orderIds: [draftOrder!.id] },
    });
    assert(draftRes.status === 400, 'Attempt to invoice DRAFT order rejected with 400 Bad Request');

    // PLACED rejected
    const placedRes = await makeRequest({
      method: 'POST',
      path: '/api/billing/invoices',
      headers: authHeaders(tokens.admin),
      body: { companyId: apexComp!.id, orderIds: [placedOrder!.id] },
    });
    assert(placedRes.status === 400, 'Attempt to invoice PLACED order rejected with 400 Bad Request');

    // CANCELLED rejected
    const cancelledRes = await makeRequest({
      method: 'POST',
      path: '/api/billing/invoices',
      headers: authHeaders(tokens.admin),
      body: { companyId: apexComp!.id, orderIds: [cancelledOrder!.id] },
    });
    assert(cancelledRes.status === 400, 'Attempt to invoice CANCELLED order rejected with 400 Bad Request');

    // REJECTED rejected
    const rejectedRes = await makeRequest({
      method: 'POST',
      path: '/api/billing/invoices',
      headers: authHeaders(tokens.admin),
      body: { companyId: apexComp!.id, orderIds: [rejectedOrder!.id] },
    });
    assert(rejectedRes.status === 400, 'Attempt to invoice REJECTED order rejected with 400 Bad Request');

    // Cross-company order rejected
    const crossRes = await makeRequest({
      method: 'POST',
      path: '/api/billing/invoices',
      headers: authHeaders(tokens.admin),
      body: { companyId: apexComp!.id, orderIds: [orderB001!.id] }, // orderB001 belongs to Summit, not Apex
    });
    assert(crossRes.status === 400, 'Attempt to invoice order from another company rejected with 400 Bad Request');

    // Already-invoiced order rejected (Double-invoicing protection)
    const duplicateRes = await makeRequest({
      method: 'POST',
      path: '/api/billing/invoices',
      headers: authHeaders(tokens.admin),
      body: { companyId: summitComp!.id, orderIds: [orderB001!.id] },
    });
    assert(duplicateRes.status === 409, 'Attempt to re-invoice an already-invoiced order rejected with 409 Conflict');

    // -------------------------------------------------------------
    // 10. Verify Mark Paid & Idempotency
    // -------------------------------------------------------------
    console.log('\n10. Verifying Mark Paid & Idempotency...');
    const markPaidRes = await makeRequest({
      method: 'POST',
      path: `/api/billing/invoices/${createdInv.id}/mark-paid`,
      headers: authHeaders(tokens.admin),
    });
    assert(markPaidRes.status === 200, 'POST /api/billing/invoices/:id/mark-paid returned 200 OK');
    assert(markPaidRes.data.status === InvoiceStatus.PAID, 'Invoice status transitioned to PAID');
    assert(!!markPaidRes.data.paidAt, 'Invoice paidAt timestamp is set');
    const firstPaidAt = markPaidRes.data.paidAt;

    // Idempotent repeated call
    const repeatPaidRes = await makeRequest({
      method: 'POST',
      path: `/api/billing/invoices/${createdInv.id}/mark-paid`,
      headers: authHeaders(tokens.admin),
    });
    assert(repeatPaidRes.status === 200, 'Repeated call to mark-paid returned 200 OK (idempotent)');
    assert(repeatPaidRes.data.status === InvoiceStatus.PAID, 'Status remains PAID');
    assert(repeatPaidRes.data.paidAt === firstPaidAt, 'paidAt timestamp remained identical and uncorrupted');

    // -------------------------------------------------------------
    // 11. Verify Post-Invoice Order Amount Change & Mismatch
    // -------------------------------------------------------------
    console.log('\n11. Verifying Post-Invoice Order Amount Change & Mismatch...');
    // Mutate FK-2026-B001 totalCents from 1500 to 1900
    await prisma.order.update({
      where: { id: orderB001!.id },
      data: { totalCents: 1900 },
    });

    const refreshedInvRes = await makeRequest({
      method: 'GET',
      path: `/api/billing/invoices/${createdInv.id}`,
      headers: authHeaders(tokens.admin),
    });
    assert(refreshedInvRes.status === 200, 'GET /api/billing/invoices/:id returned 200');
    const refreshedInv = refreshedInvRes.data;
    assert(refreshedInv.totalCents === 4000, 'Historical invoice totalCents remains untouched at 4000¢');
    const order1Item = refreshedInv.orders.find((o: any) => o.orderId === orderB001!.id);
    assert(order1Item.invoicedAmountCents === 1500, 'Order historical invoiced snapshot is 1500¢');
    assert(order1Item.currentOrderTotalCents === 1900, 'Order current amount is 1900¢');
    assert(order1Item.hasAmountMismatch === true, 'hasAmountMismatch is true');
    assert(order1Item.amountDifferenceCents === 400, 'amountDifferenceCents is +400¢');
    assert(order1Item.adjustmentRequired === true, 'adjustmentRequired is true');
    assert(refreshedInv.hasAdjustments === true, 'Invoice hasAdjustments is true');
    assert(refreshedInv.currentOrdersTotalCents === 4400, 'currentOrdersTotalCents is 4400¢ (1900 + 2500)');
    assert(refreshedInv.totalAdjustmentDifferenceCents === 400, 'totalAdjustmentDifferenceCents is +400¢');

    // -------------------------------------------------------------
    // 12. Verify Post-Invoice Order Cancellation Invariant
    // -------------------------------------------------------------
    console.log('\n12. Verifying Post-Invoice Cancellation Behavior...');
    // Cancel FK-2026-B002 post-invoicing
    await prisma.order.update({
      where: { id: orderB002!.id },
      data: {
        status: OrderStatus.CANCELLED,
        cancelledAt: new Date(),
        cancellationReason: 'Cancelled post-invoicing by client',
      },
    });

    const afterCancelInvRes = await makeRequest({
      method: 'GET',
      path: `/api/billing/invoices/${createdInv.id}`,
      headers: authHeaders(tokens.admin),
    });
    const afterCancelInv = afterCancelInvRes.data;
    assert(afterCancelInv.orderCount === 2, 'Cancelled order was NOT silently removed from invoice');
    assert(afterCancelInv.totalCents === 4000, 'Invoice totalCents still retains the captured 4000¢');
    const order2Item = afterCancelInv.orders.find((o: any) => o.orderId === orderB002!.id);
    assert(order2Item.isOrderCancelled === true, 'Order entry reports isOrderCancelled = true');
    assert(order2Item.adjustmentRequired === true, 'Order entry reports adjustmentRequired = true');
    assert(order2Item.invoicedAmountCents === 2500, 'Cancelled order retained historical snapshot of 2500¢');

    // -------------------------------------------------------------
    // 13. Verify Direct PostgreSQL Database Constraints
    // -------------------------------------------------------------
    console.log('\n13. Verifying Direct PostgreSQL Database State...');
    const dbInvoice = await prisma.invoice.findUnique({
      where: { id: createdInv.id },
      include: { orders: true },
    });
    assert(!!dbInvoice, 'DB Invoice record exists');
    assert(dbInvoice!.totalCents === 4000, 'DB Invoice totalCents is 4000');
    assert(dbInvoice!.status === InvoiceStatus.PAID, 'DB Invoice status is PAID');
    assert(dbInvoice!.orders.length === 2, 'DB has exactly 2 InvoiceOrder links');
    for (const io of dbInvoice!.orders) {
      assert(typeof io.invoicedAmountCents === 'number', 'DB invoicedAmountCents is integer number');
    }

    console.log('\n====================================================');
    console.log('🎉 ALL 26 PHASE 9 VERIFICATION CHECKS PASSED');
    console.log('====================================================\n');
  } finally {
    if (app) {
      await app.close();
    }
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  runLiveVerification()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('❌ Verification suite failed:', err);
      process.exit(1);
    });
}
