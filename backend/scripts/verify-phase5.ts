import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import * as http from 'http';
import { INestApplication, ValidationPipe } from '@nestjs/common';

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
  console.log('PHASE 5 LIVE HTTP API VERIFICATION SUITE');
  console.log('====================================================\n');

  // Boot test server on port 4001 to avoid conflicting with any port 4000 server
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
    // -------------------------------------------------------------------------
    // 1. Authenticate ADMIN and DRIVER
    // -------------------------------------------------------------------------
    console.log('1. Authentication Verification');
    const adminLogin = await makeRequest({
      method: 'POST',
      path: '/api/auth/login',
      body: { email: 'admin@test.com', password: 'Test@1234' },
    });
    assertTest(adminLogin.status === 200, 'Admin login succeeds');
    const adminToken = adminLogin.data.accessToken;

    const driverLogin = await makeRequest({
      method: 'POST',
      path: '/api/auth/login',
      body: { email: 'driver@test.com', password: 'Test@1234' },
    });
    assertTest(driverLogin.status === 200, 'Driver login succeeds');
    const driverToken = driverLogin.data.accessToken;

    // -------------------------------------------------------------------------
    // 2. Reference Data Lookup
    // -------------------------------------------------------------------------
    console.log('\n2. Reference Data Lookup');
    const packagingRes = await makeRequest({
      method: 'GET',
      path: '/api/catalogue/reference-data/packaging-types',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assertTest(packagingRes.status === 200, 'Fetch packaging types succeeds');
    const packagingId = packagingRes.data[0]?.id;

    const pricingRes = await makeRequest({
      method: 'GET',
      path: '/api/pricing/tiers',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assertTest(pricingRes.status === 200, 'Fetch price tiers succeeds');
    const defaultTier = pricingRes.data.find((t: any) => t.isDefault) || pricingRes.data[0];

    const allergensRes = await makeRequest({
      method: 'GET',
      path: '/api/catalogue/reference-data/allergens',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assertTest(allergensRes.status === 200, 'Fetch allergens succeeds');
    const sampleAllergenId = allergensRes.data[0]?.id;

    const dietaryRes = await makeRequest({
      method: 'GET',
      path: '/api/catalogue/reference-data/dietary-tags',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assertTest(dietaryRes.status === 200, 'Fetch dietary tags succeeds');
    const sampleDietaryTagId = dietaryRes.data[0]?.id;

    // -------------------------------------------------------------------------
    // 3. Company Domain & Address Validation on Creation
    // -------------------------------------------------------------------------
    console.log('\n3. Company Validation & Creation');

    // 3a. Reject public domain (gmail.com)
    const publicDomainRes = await makeRequest({
      method: 'POST',
      path: '/api/companies',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: {
        name: 'Public Domain Corp',
        domains: ['gmail.com'],
        addresses: [
          {
            label: 'HQ',
            addressLine1: 'Main St',
            city: 'Bangalore',
            state: 'KA',
            postalCode: '560001',
          },
        ],
        billingContactName: 'John',
        billingContactEmail: 'john@gmail.com',
        defaultDeliveryTimeMinutes: 720,
        defaultPackagingTypeId: packagingId,
      },
    });
    assertTest(
      publicDomainRes.status === 400,
      'Rejects public email domain (gmail.com)',
      `Status: ${publicDomainRes.status}`,
    );

    // 3b. Reject missing delivery address
    const noAddressRes = await makeRequest({
      method: 'POST',
      path: '/api/companies',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: {
        name: 'No Address Corp',
        domains: ['validtech.co'],
        addresses: [],
        billingContactName: 'John',
        billingContactEmail: 'john@validtech.co',
        defaultDeliveryTimeMinutes: 720,
        defaultPackagingTypeId: packagingId,
      },
    });
    assertTest(
      noAddressRes.status === 400,
      'Rejects company creation without delivery addresses',
      `Status: ${noAddressRes.status}`,
    );

    // 3c. Reject invalid delivery time (> 1439)
    const invalidTimeRes = await makeRequest({
      method: 'POST',
      path: '/api/companies',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: {
        name: 'Invalid Time Corp',
        domains: ['timedev.com'],
        addresses: [
          {
            label: 'HQ',
            addressLine1: 'Main St',
            city: 'Bangalore',
            state: 'KA',
            postalCode: '560001',
          },
        ],
        billingContactName: 'John',
        billingContactEmail: 'john@timedev.com',
        defaultDeliveryTimeMinutes: 1500, // Invalid!
        defaultPackagingTypeId: packagingId,
      },
    });
    assertTest(
      invalidTimeRes.status === 400,
      'Rejects delivery time > 1439 minutes',
      `Status: ${invalidTimeRes.status}`,
    );

    // 3d. Create valid company
    const uniqueSuffix = Date.now();
    const createCompanyRes = await makeRequest({
      method: 'POST',
      path: '/api/companies',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: {
        name: `Horizon Technologies ${uniqueSuffix}`,
        domains: [`horizon-${uniqueSuffix}.com`],
        addresses: [
          {
            label: 'Horizon HQ',
            addressLine1: '100 Silicon Highway',
            addressLine2: 'Tech Zone 4',
            city: 'Bangalore',
            state: 'Karnataka',
            postalCode: '560045',
          },
        ],
        billingContactName: 'Vikram Seth',
        billingContactEmail: `billing@horizon-${uniqueSuffix}.com`,
        billingContactPhone: '+91-9876543210',
        defaultDeliveryTimeMinutes: 720,
        deliveryMinutesBefore: 45,
        defaultPackagingTypeId: packagingId,
        priceTierId: defaultTier.id,
      },
    });
    assertTest(
      createCompanyRes.status === 201,
      'Successfully creates company with domains, address, and defaults',
      `Status: ${createCompanyRes.status}`,
    );
    const companyId = createCompanyRes.data.id;
    const initialAddressId = createCompanyRes.data.addresses[0]?.id;

    // 3e. Reject duplicate domain under another company
    const dupDomainRes = await makeRequest({
      method: 'POST',
      path: '/api/companies',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: {
        name: `Clone Corp ${uniqueSuffix}`,
        domains: [`horizon-${uniqueSuffix}.com`], // duplicate
        addresses: [
          {
            label: 'Branch',
            addressLine1: 'Other St',
            city: 'Bangalore',
            state: 'KA',
            postalCode: '560002',
          },
        ],
        billingContactName: 'Alice',
        billingContactEmail: `alice@horizon-${uniqueSuffix}.com`,
        defaultDeliveryTimeMinutes: 720,
        defaultPackagingTypeId: packagingId,
      },
    });
    assertTest(
      dupDomainRes.status === 409,
      'Rejects duplicate domain registered by another company (409 Conflict)',
      `Status: ${dupDomainRes.status}`,
    );

    // -------------------------------------------------------------------------
    // 4. Domains, Addresses, Calendars & Holidays
    // -------------------------------------------------------------------------
    console.log('\n4. Domains, Addresses, Calendars & Holidays');

    // 4a. Add secondary domain
    const addDomainRes = await makeRequest({
      method: 'POST',
      path: `/api/companies/${companyId}/domains`,
      headers: { Authorization: `Bearer ${adminToken}` },
      body: { domain: `horizon-${uniqueSuffix}.io` },
    });
    assertTest(addDomainRes.status === 201, 'Adds secondary domain to company');

    // 4b. Add secondary address
    const addAddressRes = await makeRequest({
      method: 'POST',
      path: `/api/companies/${companyId}/addresses`,
      headers: { Authorization: `Bearer ${adminToken}` },
      body: {
        label: 'Horizon Innovation Lab',
        addressLine1: '42 Research Way',
        city: 'Bangalore',
        state: 'Karnataka',
        postalCode: '560066',
      },
    });
    assertTest(addAddressRes.status === 201, 'Adds secondary delivery address');
    const secondAddressId = addAddressRes.data.id;

    // 4c. Soft delete (deactivate) second address
    const deleteAddressRes = await makeRequest({
      method: 'DELETE',
      path: `/api/companies/${companyId}/addresses/${secondAddressId}`,
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assertTest(
      deleteAddressRes.status === 200 && deleteAddressRes.data.isActive === false,
      'Soft-deactivates delivery address (preserves historical references)',
    );

    // 4d. Update working days (set Saturday working)
    const updateDaysRes = await makeRequest({
      method: 'PUT',
      path: `/api/companies/${companyId}/working-days`,
      headers: { Authorization: `Bearer ${adminToken}` },
      body: {
        dayOfWeek: 'SATURDAY',
        isWorking: true,
      },
    });
    assertTest(updateDaysRes.status === 200, 'Configures custom company working days');

    // 4e. Add company holiday
    const holidayDate = '2026-12-25';
    const addHolidayRes = await makeRequest({
      method: 'POST',
      path: `/api/companies/${companyId}/holidays`,
      headers: { Authorization: `Bearer ${adminToken}` },
      body: {
        date: holidayDate,
        name: 'Christmas Holiday',
      },
    });
    assertTest(addHolidayRes.status === 201, 'Creates company holiday');

    // 4f. Reject duplicate holiday date
    const dupHolidayRes = await makeRequest({
      method: 'POST',
      path: `/api/companies/${companyId}/holidays`,
      headers: { Authorization: `Bearer ${adminToken}` },
      body: {
        date: holidayDate,
        name: 'Duplicate Holiday',
      },
    });
    assertTest(
      dupHolidayRes.status === 409,
      'Rejects duplicate company holiday on same date (409 Conflict)',
    );

    // 4g. Check delivery day eligibility
    const eligibleDayRes = await makeRequest({
      method: 'GET',
      path: `/api/companies/${companyId}/delivery-day-check?date=2026-10-06`, // A Tuesday
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assertTest(
      eligibleDayRes.status === 200 && eligibleDayRes.data.canDeliver === true,
      'Detects eligible delivery working day',
      JSON.stringify(eligibleDayRes.data),
    );

    const holidayCheckRes = await makeRequest({
      method: 'GET',
      path: `/api/companies/${companyId}/delivery-day-check?date=${holidayDate}`,
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assertTest(
      holidayCheckRes.status === 200 &&
        holidayCheckRes.data.canDeliver === false &&
        holidayCheckRes.data.reason?.includes('holiday'),
      'Detects holiday non-delivery day on company calendar',
      JSON.stringify(holidayCheckRes.data),
    );

    // -------------------------------------------------------------------------
    // 5. Employee Operations
    // -------------------------------------------------------------------------
    console.log('\n5. Employee Management');

    // 5a. Reject employee creation with mismatched corporate domain
    const mismatchedEmpRes = await makeRequest({
      method: 'POST',
      path: '/api/employees',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: {
        companyId,
        firstName: 'Jane',
        lastName: 'Doe',
        email: `jane@unrelateddomain.org`,
      },
    });
    assertTest(
      mismatchedEmpRes.status === 400,
      'Rejects employee email domain not matching registered company domains',
      `Status: ${mismatchedEmpRes.status}`,
    );

    // 5b. Reject employee address belonging to another company
    const otherCompanyAddressRes = await makeRequest({
      method: 'POST',
      path: '/api/employees',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: {
        companyId,
        firstName: 'Jane',
        lastName: 'Doe',
        email: `jane@horizon-${uniqueSuffix}.com`,
        defaultDeliveryAddressId: 'foreign-address-id',
      },
    });
    assertTest(
      otherCompanyAddressRes.status === 400,
      'Rejects employee default address from another company',
      `Status: ${otherCompanyAddressRes.status}`,
    );

    // 5c. Create valid employee with preferences, allergies, dietary tags
    const createEmpRes = await makeRequest({
      method: 'POST',
      path: '/api/employees',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: {
        companyId,
        firstName: 'Karan',
        lastName: 'Mehta',
        email: `karan.mehta@horizon-${uniqueSuffix}.com`,
        phone: '+91-9988776655',
        canChooseDeliveryAddress: true,
        canChangeDeliveryTime: true,
        canChangePackaging: true,
        defaultDeliveryAddressId: initialAddressId,
        defaultDeliveryTimeMinutes: 750,
        defaultPackagingTypeId: packagingId,
        allergenIds: sampleAllergenId ? [sampleAllergenId] : [],
        dietaryTagIds: sampleDietaryTagId ? [sampleDietaryTagId] : [],
      },
    });
    assertTest(
      createEmpRes.status === 201,
      'Creates employee with dietary profile, preferences, and permissions',
      `Status: ${createEmpRes.status}`,
    );
    const employeeId = createEmpRes.data.id;

    // 5d. Retrieve employee and verify relationships
    const getEmpRes = await makeRequest({
      method: 'GET',
      path: `/api/employees/${employeeId}`,
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assertTest(
      getEmpRes.status === 200 &&
        getEmpRes.data.companyId === companyId &&
        getEmpRes.data.canChooseDeliveryAddress === true &&
        getEmpRes.data.canChangeDeliveryTime === true,
      'Retrieves employee with exact permissions and company association',
    );

    // 5e. Set employee as company owner
    const setOwnerRes = await makeRequest({
      method: 'PATCH',
      path: `/api/companies/${companyId}`,
      headers: { Authorization: `Bearer ${adminToken}` },
      body: {
        ownerEmployeeId: employeeId,
      },
    });
    assertTest(
      setOwnerRes.status === 200 && setOwnerRes.data.ownerEmployeeId === employeeId,
      'Assigns owner employee to company without circular deadlock',
    );

    // 5f. Employee cross-company transfer
    // Create destination company
    const destCompanyRes = await makeRequest({
      method: 'POST',
      path: '/api/companies',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: {
        name: `Dest Systems ${uniqueSuffix}`,
        domains: [`destsys-${uniqueSuffix}.com`],
        addresses: [
          {
            label: 'Dest HQ',
            addressLine1: '99 South End Rd',
            city: 'Bangalore',
            state: 'KA',
            postalCode: '560004',
          },
        ],
        billingContactName: 'Maya',
        billingContactEmail: `maya@destsys-${uniqueSuffix}.com`,
        defaultDeliveryTimeMinutes: 720,
        defaultPackagingTypeId: packagingId,
      },
    });
    const destCompanyId = destCompanyRes.data.id;
    const destAddressId = destCompanyRes.data.addresses[0]?.id;

    // Transfer employee to destination company
    const transferRes = await makeRequest({
      method: 'POST',
      path: `/api/employees/${employeeId}/transfer`,
      headers: { Authorization: `Bearer ${adminToken}` },
      body: {
        newCompanyId: destCompanyId,
        newEmail: `karan.transfer@destsys-${uniqueSuffix}.com`,
        newDefaultAddressId: destAddressId,
      },
    });
    assertTest(
      (transferRes.status === 200 || transferRes.status === 201) &&
        transferRes.data.companyId === destCompanyId &&
        transferRes.data.defaultDeliveryAddressId === destAddressId,
      'Transfers employee to new company and binds to destination company address',
      JSON.stringify({ status: transferRes.status, data: transferRes.data }),
    );

    // -------------------------------------------------------------------------
    // 6. RBAC & Authorization
    // -------------------------------------------------------------------------
    console.log('\n6. Authorization & RBAC Enforcement');

    // 6a. Non-admin (Driver) attempting company creation -> 403
    const forbiddenCompanyRes = await makeRequest({
      method: 'POST',
      path: '/api/companies',
      headers: { Authorization: `Bearer ${driverToken}` },
      body: {
        name: 'Unauthorized Corp',
        domains: ['unauth.com'],
        addresses: [
          {
            label: 'HQ',
            addressLine1: 'St',
            city: 'Bangalore',
            state: 'KA',
            postalCode: '560001',
          },
        ],
        billingContactName: 'Bob',
        billingContactEmail: 'bob@unauth.com',
        defaultDeliveryTimeMinutes: 720,
        defaultPackagingTypeId: packagingId,
      },
    });
    assertTest(
      forbiddenCompanyRes.status === 403,
      'Driver without companies.manage receives 403 Forbidden on company creation',
      `Status: ${forbiddenCompanyRes.status}`,
    );

    // 6b. Non-admin (Driver) attempting employee creation -> 403
    const forbiddenEmpRes = await makeRequest({
      method: 'POST',
      path: '/api/employees',
      headers: { Authorization: `Bearer ${driverToken}` },
      body: {
        companyId: destCompanyId,
        firstName: 'Unauthorized',
        lastName: 'User',
        email: `unauth@destsys-${uniqueSuffix}.com`,
      },
    });
    assertTest(
      forbiddenEmpRes.status === 403,
      'Driver without employees.manage receives 403 Forbidden on employee creation',
      `Status: ${forbiddenEmpRes.status}`,
    );

    // 6c. Unauthenticated request -> 401
    const unauthRes = await makeRequest({
      method: 'GET',
      path: '/api/companies',
    });
    assertTest(
      unauthRes.status === 401,
      'Unauthenticated request receives 401 Unauthorized',
      `Status: ${unauthRes.status}`,
    );

    // -------------------------------------------------------------------------
    // Summary
    // -------------------------------------------------------------------------
    console.log('\n====================================================');
    console.log(`TOTAL TESTS: ${totalTests}`);
    console.log(`PASSED: ${passedTests}`);
    console.log(`FAILED: ${totalTests - passedTests}`);
    console.log('====================================================');

    if (passedTests === totalTests) {
      console.log('🎉 ALL LIVE API TESTS PASSED SUCCESSFULLY!');
    } else {
      console.error('❌ SOME LIVE API TESTS FAILED.');
      process.exitCode = 1;
    }
  } catch (error) {
    console.error('Unexpected error during verification:', error);
    process.exitCode = 1;
  } finally {
    await app.close();
  }
}

if (require.main === module) {
  runLiveVerification();
}
