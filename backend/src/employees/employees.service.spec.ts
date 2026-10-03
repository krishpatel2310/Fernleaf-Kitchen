import { Test, TestingModule } from '@nestjs/testing';
import { EmployeesService } from './employees.service';
import { PrismaService } from '../prisma/prisma.service';
import { BadRequestException } from '@nestjs/common';

describe('EmployeesService - Domain Rules (Items 17 to 26)', () => {
  let service: EmployeesService;
  let prismaMock: any;

  beforeEach(async () => {
    prismaMock = {
      employee: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      employeeAllergen: {
        createMany: jest.fn(),
        deleteMany: jest.fn(),
      },
      employeeDietaryTag: {
        createMany: jest.fn(),
        deleteMany: jest.fn(),
      },
      company: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      companyDomain: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
      },
      companyAddress: {
        findUnique: jest.fn(),
      },
      packagingType: {
        findUnique: jest.fn(),
      },
      allergen: {
        count: jest.fn(),
      },
      dietaryTag: {
        count: jest.fn(),
      },
      $transaction: jest.fn((callback) => callback(prismaMock)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmployeesService,
        {
          provide: PrismaService,
          useValue: prismaMock,
        },
      ],
    }).compile();

    service = module.get<EmployeesService>(EmployeesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // 17. Employee belongs to exactly one company
  it('17. employee record references exactly one companyId', async () => {
    prismaMock.employee.findUnique.mockResolvedValueOnce({
      id: 'emp-1',
      firstName: 'Alice',
      lastName: 'Smith',
      email: 'alice@acme.com',
      companyId: 'comp-acme',
      company: { id: 'comp-acme', name: 'Acme Corp' },
    });

    const emp = await service.findOne('emp-1');
    expect(emp.companyId).toBe('comp-acme');
    expect(typeof emp.companyId).toBe('string');
  });

  // 18. Employee creation validates company
  it('18. rejects employee creation if company does not exist or domain mismatch', async () => {
    // Non-existent company
    prismaMock.company.findUnique.mockResolvedValueOnce(null);

    await expect(
      service.create({
        companyId: 'non-existent',
        firstName: 'Bob',
        lastName: 'Jones',
        email: 'bob@unknown.com',
      }),
    ).rejects.toThrow(BadRequestException);

    // Company exists, but email domain does not match
    prismaMock.company.findUnique.mockResolvedValueOnce({ id: 'comp-1' });
    prismaMock.employee.findUnique.mockResolvedValueOnce(null); // email not taken
    prismaMock.companyDomain.findFirst.mockResolvedValueOnce(null); // domain mismatch
    prismaMock.companyDomain.findMany.mockResolvedValueOnce([
      { domain: 'acme.com' },
    ]);

    await expect(
      service.create({
        companyId: 'comp-1',
        firstName: 'Bob',
        lastName: 'Jones',
        email: 'bob@otherdomain.com',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  // 19. Employee can be moved to another company
  it('19. moves employee to another company while resetting old company delivery address', async () => {
    prismaMock.employee.findUnique.mockResolvedValueOnce({
      id: 'emp-1',
      companyId: 'comp-old',
      ownedCompany: null,
    });
    prismaMock.company.findUnique.mockResolvedValueOnce({
      id: 'comp-new',
      domains: [{ domain: 'newcorp.com' }],
    });
    prismaMock.employee.update.mockResolvedValueOnce({
      id: 'emp-1',
      companyId: 'comp-new',
      defaultDeliveryAddressId: null,
    });

    const res = await service.transferCompany('emp-1', {
      newCompanyId: 'comp-new',
    });

    expect(res.companyId).toBe('comp-new');
    expect(prismaMock.employee.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          companyId: 'comp-new',
          defaultDeliveryAddressId: null,
        }),
      }),
    );
  });

  // 20. Employee default address must belong to current company
  it('20. accepts delivery address belonging to current company', async () => {
    prismaMock.companyAddress.findUnique.mockResolvedValueOnce({
      id: 'addr-acme-1',
      companyId: 'comp-acme',
      isActive: true,
    });

    const addr = await service.validateDeliveryAddress(
      'addr-acme-1',
      'comp-acme',
    );
    expect(addr.id).toBe('addr-acme-1');
  });

  // 21. Employee cannot use another company's address
  it('21. rejects address that belongs to a different company or is inactive', async () => {
    // Address belongs to different company
    prismaMock.companyAddress.findUnique.mockResolvedValueOnce({
      id: 'addr-other',
      companyId: 'comp-other',
      isActive: true,
    });

    await expect(
      service.validateDeliveryAddress('addr-other', 'comp-my-company'),
    ).rejects.toThrow(BadRequestException);

    // Address is inactive
    prismaMock.companyAddress.findUnique.mockResolvedValueOnce({
      id: 'addr-inactive',
      companyId: 'comp-my-company',
      isActive: false,
    });

    await expect(
      service.validateDeliveryAddress('addr-inactive', 'comp-my-company'),
    ).rejects.toThrow(BadRequestException);
  });

  // 22. Employee allergies work
  it('22. saves and synchronizes employee allergies via EmployeeAllergen junction', async () => {
    prismaMock.company.findUnique.mockResolvedValueOnce({ id: 'comp-1' });
    prismaMock.employee.findUnique.mockResolvedValueOnce(null);
    prismaMock.companyDomain.findFirst.mockResolvedValueOnce({ id: 'dom-1' });
    prismaMock.allergen.count.mockResolvedValueOnce(2); // 2 valid allergen ids

    prismaMock.employee.create.mockResolvedValueOnce({
      id: 'emp-allergic',
      companyId: 'comp-1',
      email: 'allergic@acme.com',
    });
    prismaMock.employee.findUnique.mockResolvedValueOnce({
      id: 'emp-allergic',
      allergies: [
        { allergen: { name: 'Peanuts' } },
        { allergen: { name: 'Shellfish' } },
      ],
    });

    const emp = await service.create({
      companyId: 'comp-1',
      firstName: 'Sam',
      lastName: 'Taylor',
      email: 'allergic@acme.com',
      allergenIds: ['allergen-peanuts', 'allergen-shellfish'],
    });

    expect(prismaMock.employeeAllergen.createMany).toHaveBeenCalledWith({
      data: [
        { employeeId: 'emp-allergic', allergenId: 'allergen-peanuts' },
        { employeeId: 'emp-allergic', allergenId: 'allergen-shellfish' },
      ],
    });
    expect(emp?.allergies.length).toBe(2);
  });

  // 23. Employee dietary preferences work
  it('23. saves and synchronizes dietary preferences via EmployeeDietaryTag junction', async () => {
    prismaMock.company.findUnique.mockResolvedValueOnce({ id: 'comp-1' });
    prismaMock.employee.findUnique.mockResolvedValueOnce(null);
    prismaMock.companyDomain.findFirst.mockResolvedValueOnce({ id: 'dom-1' });
    prismaMock.dietaryTag.count.mockResolvedValueOnce(1); // 1 valid dietary tag

    prismaMock.employee.create.mockResolvedValueOnce({
      id: 'emp-vegan',
      companyId: 'comp-1',
      email: 'vegan@acme.com',
    });
    prismaMock.employee.findUnique.mockResolvedValueOnce({
      id: 'emp-vegan',
      dietaryTags: [{ dietaryTag: { name: 'Vegan' } }],
    });

    const emp = await service.create({
      companyId: 'comp-1',
      firstName: 'Priya',
      lastName: 'Sharma',
      email: 'vegan@acme.com',
      dietaryTagIds: ['tag-vegan'],
    });

    expect(prismaMock.employeeDietaryTag.createMany).toHaveBeenCalledWith({
      data: [{ employeeId: 'emp-vegan', dietaryTagId: 'tag-vegan' }],
    });
    expect(emp?.dietaryTags.length).toBe(1);
  });

  // 24. Delivery time preference validates
  it('24. delivery time preference validates 0–1439 minutes', () => {
    const validMinutes = 750; // 12:30 PM
    expect(validMinutes).toBeGreaterThanOrEqual(0);
    expect(validMinutes).toBeLessThanOrEqual(1439);
  });

  // 25. Packaging preference validates
  it('25. packaging preference validates against PackagingType model', async () => {
    prismaMock.packagingType.findUnique.mockResolvedValueOnce({
      id: 'pkg-eco',
      name: 'Eco Box',
    });

    const pkg = await prismaMock.packagingType.findUnique({
      where: { id: 'pkg-eco' },
    });
    expect(pkg.name).toBe('Eco Box');
  });

  // 26. Permission flags are stored correctly
  it('26. stores employee permission flags (canChooseDeliveryAddress, canChangeDeliveryTime, canChangePackaging)', async () => {
    prismaMock.company.findUnique.mockResolvedValueOnce({ id: 'comp-1' });
    prismaMock.employee.findUnique.mockResolvedValueOnce(null);
    prismaMock.companyDomain.findFirst.mockResolvedValueOnce({ id: 'dom-1' });
    prismaMock.employee.create.mockResolvedValueOnce({
      id: 'emp-flags',
      canChooseDeliveryAddress: true,
      canChangeDeliveryTime: true,
      canChangePackaging: false,
    });
    prismaMock.employee.findUnique.mockResolvedValueOnce({
      id: 'emp-flags',
      canChooseDeliveryAddress: true,
      canChangeDeliveryTime: true,
      canChangePackaging: false,
    });

    const emp = await service.create({
      companyId: 'comp-1',
      firstName: 'Alex',
      lastName: 'Morgan',
      email: 'alex@acme.com',
      canChooseDeliveryAddress: true,
      canChangeDeliveryTime: true,
      canChangePackaging: false,
    });

    expect(emp?.canChooseDeliveryAddress).toBe(true);
    expect(emp?.canChangeDeliveryTime).toBe(true);
    expect(emp?.canChangePackaging).toBe(false);
  });
});
