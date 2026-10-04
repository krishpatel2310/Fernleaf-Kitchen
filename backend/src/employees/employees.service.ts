import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { TransferEmployeeDto } from './dto/transfer-employee.dto';
import { QueryEmployeeDto } from './dto/query-employee.dto';
import { BulkImportEmployeesDto } from './dto/bulk-import-employees.dto';

@Injectable()
export class EmployeesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Validates that an employee email's domain matches one of the company's registered domains.
   */
  async validateEmployeeEmailDomain(email: string, companyId: string) {
    const parts = email.trim().toLowerCase().split('@');
    if (parts.length !== 2) {
      throw new BadRequestException(`Invalid email format: '${email}'`);
    }

    const domain = parts[1];
    const companyDomain = await this.prisma.companyDomain.findFirst({
      where: { companyId, domain },
    });

    if (!companyDomain) {
      const allowedDomains = await this.prisma.companyDomain.findMany({
        where: { companyId },
        select: { domain: true },
      });
      const domainList = allowedDomains.map((d) => d.domain).join(', ');
      throw new BadRequestException(
        `Employee email domain '@${domain}' does not match company's registered domain(s): ${domainList}`,
      );
    }
  }

  /**
   * Validates that a delivery address belongs to the specified company and is active.
   */
  async validateDeliveryAddress(addressId: string, companyId: string) {
    const address = await this.prisma.companyAddress.findUnique({
      where: { id: addressId },
    });

    if (!address) {
      throw new BadRequestException(
        `Delivery address with ID '${addressId}' does not exist`,
      );
    }

    if (address.companyId !== companyId) {
      throw new BadRequestException(
        `Delivery address '${addressId}' does not belong to company '${companyId}'`,
      );
    }

    if (!address.isActive) {
      throw new BadRequestException(
        `Delivery address '${addressId}' is inactive`,
      );
    }

    return address;
  }

  // ===========================================================================
  // EMPLOYEE CRUD
  // ===========================================================================

  async findAll(query: QueryEmployeeDto = {}) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (!query.includeInactive) {
      where.isActive = true;
    }
    if (query.companyId) {
      where.companyId = query.companyId;
    }
    if (query.search) {
      const q = query.search.trim();
      where.OR = [
        { firstName: { contains: q, mode: 'insensitive' } },
        { lastName: { contains: q, mode: 'insensitive' } },
        { email: { contains: q, mode: 'insensitive' } },
        { phone: { contains: q, mode: 'insensitive' } },
      ];
    }

    const [total, data] = await Promise.all([
      this.prisma.employee.count({ where }),
      this.prisma.employee.findMany({
        where,
        skip,
        take: limit,
        include: {
          company: {
            select: { id: true, name: true },
          },
          defaultDeliveryAddress: true,
          defaultPackaging: true,
          allergies: { include: { allergen: true } },
          dietaryTags: { include: { dietaryTag: true } },
        },
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      }),
    ]);

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  async findOne(id: string) {
    const employee = await this.prisma.employee.findUnique({
      where: { id },
      include: {
        company: {
          include: {
            domains: true,
            addresses: { where: { isActive: true } },
            priceTier: true,
          },
        },
        defaultDeliveryAddress: true,
        defaultPackaging: true,
        allergies: { include: { allergen: true } },
        dietaryTags: { include: { dietaryTag: true } },
        ownedCompany: { select: { id: true, name: true } },
      },
    });

    if (!employee) {
      throw new NotFoundException(`Employee with ID '${id}' not found`);
    }

    return employee;
  }

  async create(dto: CreateEmployeeDto) {
    const email = dto.email.trim().toLowerCase();

    // 1. Validate company exists
    const company = await this.prisma.company.findUnique({
      where: { id: dto.companyId },
    });
    if (!company) {
      throw new BadRequestException(
        `Company with ID '${dto.companyId}' does not exist`,
      );
    }

    // 2. Validate email uniqueness
    const existing = await this.prisma.employee.findUnique({
      where: { email },
    });
    if (existing) {
      throw new ConflictException(
        `Employee with email '${email}' already exists`,
      );
    }

    // 3. Validate email domain matches company
    await this.validateEmployeeEmailDomain(email, dto.companyId);

    // 4. Validate default delivery address belongs to company
    if (dto.defaultDeliveryAddressId) {
      await this.validateDeliveryAddress(
        dto.defaultDeliveryAddressId,
        dto.companyId,
      );
    }

    // 5. Validate packaging type if supplied
    if (dto.defaultPackagingTypeId) {
      const packaging = await this.prisma.packagingType.findUnique({
        where: { id: dto.defaultPackagingTypeId },
      });
      if (!packaging) {
        throw new BadRequestException(
          `Packaging type with ID '${dto.defaultPackagingTypeId}' not found`,
        );
      }
    }

    // 6. Validate allergens
    if (dto.allergenIds && dto.allergenIds.length > 0) {
      const count = await this.prisma.allergen.count({
        where: { id: { in: dto.allergenIds } },
      });
      if (count !== dto.allergenIds.length) {
        throw new BadRequestException(`One or more allergen IDs are invalid`);
      }
    }

    // 7. Validate dietary tags
    if (dto.dietaryTagIds && dto.dietaryTagIds.length > 0) {
      const count = await this.prisma.dietaryTag.count({
        where: { id: { in: dto.dietaryTagIds } },
      });
      if (count !== dto.dietaryTagIds.length) {
        throw new BadRequestException(
          `One or more dietary tag IDs are invalid`,
        );
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const employee = await tx.employee.create({
        data: {
          companyId: dto.companyId,
          firstName: dto.firstName.trim(),
          lastName: dto.lastName.trim(),
          email,
          phone: dto.phone?.trim(),
          canChooseDeliveryAddress: dto.canChooseDeliveryAddress ?? false,
          canChangeDeliveryTime: dto.canChangeDeliveryTime ?? false,
          canChangePackaging: dto.canChangePackaging ?? false,
          defaultDeliveryAddressId: dto.defaultDeliveryAddressId,
          defaultDeliveryTimeMinutes: dto.defaultDeliveryTimeMinutes,
          defaultPackagingTypeId: dto.defaultPackagingTypeId,
        },
      });

      if (dto.allergenIds && dto.allergenIds.length > 0) {
        await tx.employeeAllergen.createMany({
          data: dto.allergenIds.map((allergenId) => ({
            employeeId: employee.id,
            allergenId,
          })),
        });
      }

      if (dto.dietaryTagIds && dto.dietaryTagIds.length > 0) {
        await tx.employeeDietaryTag.createMany({
          data: dto.dietaryTagIds.map((dietaryTagId) => ({
            employeeId: employee.id,
            dietaryTagId,
          })),
        });
      }

      return tx.employee.findUnique({
        where: { id: employee.id },
        include: {
          company: true,
          defaultDeliveryAddress: true,
          allergies: { include: { allergen: true } },
          dietaryTags: { include: { dietaryTag: true } },
        },
      });
    });
  }

  async update(id: string, dto: UpdateEmployeeDto) {
    const employee = await this.prisma.employee.findUnique({ where: { id } });
    if (!employee) {
      throw new NotFoundException(`Employee with ID '${id}' not found`);
    }

    if (dto.email && dto.email.trim().toLowerCase() !== employee.email) {
      const newEmail = dto.email.trim().toLowerCase();
      const existing = await this.prisma.employee.findUnique({
        where: { email: newEmail },
      });
      if (existing) {
        throw new ConflictException(
          `Employee with email '${newEmail}' already exists`,
        );
      }
      await this.validateEmployeeEmailDomain(newEmail, employee.companyId);
    }

    if (dto.defaultDeliveryAddressId) {
      await this.validateDeliveryAddress(
        dto.defaultDeliveryAddressId,
        employee.companyId,
      );
    }

    if (dto.defaultPackagingTypeId) {
      const packaging = await this.prisma.packagingType.findUnique({
        where: { id: dto.defaultPackagingTypeId },
      });
      if (!packaging) {
        throw new BadRequestException(
          `Packaging type with ID '${dto.defaultPackagingTypeId}' not found`,
        );
      }
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.employee.update({
        where: { id },
        data: {
          firstName: dto.firstName ? dto.firstName.trim() : undefined,
          lastName: dto.lastName ? dto.lastName.trim() : undefined,
          email: dto.email ? dto.email.trim().toLowerCase() : undefined,
          phone: dto.phone !== undefined ? dto.phone?.trim() : undefined,
          isActive: dto.isActive,
          canChooseDeliveryAddress: dto.canChooseDeliveryAddress,
          canChangeDeliveryTime: dto.canChangeDeliveryTime,
          canChangePackaging: dto.canChangePackaging,
          defaultDeliveryAddressId: dto.defaultDeliveryAddressId,
          defaultDeliveryTimeMinutes: dto.defaultDeliveryTimeMinutes,
          defaultPackagingTypeId: dto.defaultPackagingTypeId,
        },
      });

      if (dto.allergenIds !== undefined) {
        await tx.employeeAllergen.deleteMany({ where: { employeeId: id } });
        if (dto.allergenIds.length > 0) {
          await tx.employeeAllergen.createMany({
            data: dto.allergenIds.map((allergenId) => ({
              employeeId: id,
              allergenId,
            })),
          });
        }
      }

      if (dto.dietaryTagIds !== undefined) {
        await tx.employeeDietaryTag.deleteMany({ where: { employeeId: id } });
        if (dto.dietaryTagIds.length > 0) {
          await tx.employeeDietaryTag.createMany({
            data: dto.dietaryTagIds.map((dietaryTagId) => ({
              employeeId: id,
              dietaryTagId,
            })),
          });
        }
      }

      return tx.employee.findUnique({
        where: { id },
        include: {
          company: true,
          defaultDeliveryAddress: true,
          allergies: { include: { allergen: true } },
          dietaryTags: { include: { dietaryTag: true } },
        },
      });
    });
  }

  /**
   * Transfers an employee from their current company to a new company.
   * Clears old company address and requires valid new company address or sets null.
   * Existing historical orders retain their historical companyId.
   */
  async transferCompany(id: string, dto: TransferEmployeeDto) {
    const employee = await this.prisma.employee.findUnique({
      where: { id },
      include: { ownedCompany: true },
    });

    if (!employee) {
      throw new NotFoundException(`Employee with ID '${id}' not found`);
    }

    if (employee.companyId === dto.newCompanyId) {
      throw new BadRequestException(
        `Employee is already assigned to company '${dto.newCompanyId}'`,
      );
    }

    const newCompany = await this.prisma.company.findUnique({
      where: { id: dto.newCompanyId },
      include: { domains: true },
    });

    if (!newCompany) {
      throw new NotFoundException(
        `Target company with ID '${dto.newCompanyId}' not found`,
      );
    }

    // Check if new address belongs to new company
    let newAddressId: string | null = null;
    if (dto.newDefaultAddressId) {
      await this.validateDeliveryAddress(
        dto.newDefaultAddressId,
        dto.newCompanyId,
      );
      newAddressId = dto.newDefaultAddressId;
    }

    // Validate new email if provided
    let emailToUpdate: string | undefined = undefined;
    if (dto.newEmail) {
      const normalizedEmail = dto.newEmail.trim().toLowerCase();
      await this.validateEmployeeEmailDomain(normalizedEmail, dto.newCompanyId);
      const existing = await this.prisma.employee.findUnique({
        where: { email: normalizedEmail },
      });
      if (existing && existing.id !== id) {
        throw new ConflictException(
          `Email '${normalizedEmail}' is already registered to another employee`,
        );
      }
      emailToUpdate = normalizedEmail;
    }

    return this.prisma.$transaction(async (tx) => {
      // If employee was owner of old company, disassociate
      if (employee.ownedCompany) {
        await tx.company.update({
          where: { id: employee.companyId },
          data: { ownerEmployeeId: null },
        });
      }

      return tx.employee.update({
        where: { id },
        data: {
          companyId: dto.newCompanyId,
          defaultDeliveryAddressId: newAddressId, // Reset old company address
          email: emailToUpdate,
        },
        include: {
          company: true,
          defaultDeliveryAddress: true,
        },
      });
    });
  }

  async setEmployeeActive(id: string, isActive: boolean) {
    const employee = await this.prisma.employee.findUnique({ where: { id } });
    if (!employee) {
      throw new NotFoundException(`Employee with ID '${id}' not found`);
    }

    return this.prisma.employee.update({
      where: { id },
      data: { isActive },
    });
  }

  async bulkImport(dto: BulkImportEmployeesDto) {
    const company = await this.prisma.company.findUnique({
      where: { id: dto.companyId },
      include: { domains: true },
    });
    if (!company) {
      throw new NotFoundException(
        `Company with ID '${dto.companyId}' not found`,
      );
    }

    const companyDomains = new Set(
      company.domains.map((d) => d.domain.toLowerCase()),
    );

    // Parse rows from array or csvText
    const rowsToProcess = dto.rows || [];
    if (!rowsToProcess.length && dto.csvText) {
      const lines = dto.csvText
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean);
      // Skip header if first line looks like header
      const startIndex = lines[0]?.toLowerCase().includes('email') ? 1 : 0;
      for (let i = startIndex; i < lines.length; i++) {
        const parts = lines[i].split(',').map((p) => p.trim());
        if (parts.length >= 2) {
          rowsToProcess.push({
            firstName: parts[0],
            lastName: parts[1] || undefined,
            email: parts[2] || parts[1], // fallback if only 2 columns: name, email
            phone: parts[3] || undefined,
          });
        }
      }
    }

    const results: Array<{
      row: number;
      email: string;
      status: 'IMPORTED' | 'FAILED';
      employeeId?: string;
      error?: string;
    }> = [];

    let importedCount = 0;
    let failedCount = 0;

    for (let i = 0; i < rowsToProcess.length; i++) {
      const row = rowsToProcess[i];
      const rowNum = i + 1;
      const cleanEmail = (row.email || '').trim().toLowerCase();
      const cleanFirstName = (row.firstName || '').trim();

      if (!cleanFirstName) {
        failedCount++;
        results.push({
          row: rowNum,
          email: cleanEmail,
          status: 'FAILED',
          error: 'First name is required',
        });
        continue;
      }

      if (!cleanEmail || !cleanEmail.includes('@')) {
        failedCount++;
        results.push({
          row: rowNum,
          email: cleanEmail,
          status: 'FAILED',
          error: 'Valid email is required',
        });
        continue;
      }

      const domain = cleanEmail.split('@')[1];
      if (!companyDomains.has(domain)) {
        failedCount++;
        const allowed = Array.from(companyDomains).join(', ');
        results.push({
          row: rowNum,
          email: cleanEmail,
          status: 'FAILED',
          error: `Domain '@${domain}' does not belong to company '${company.name}'. Allowed: ${allowed}`,
        });
        continue;
      }

      const existing = await this.prisma.employee.findUnique({
        where: { email: cleanEmail },
      });
      if (existing) {
        failedCount++;
        results.push({
          row: rowNum,
          email: cleanEmail,
          status: 'FAILED',
          error: `Employee with email '${cleanEmail}' already exists`,
        });
        continue;
      }

      try {
        const created = await this.prisma.employee.create({
          data: {
            companyId: dto.companyId,
            firstName: cleanFirstName,
            lastName: (row.lastName || '').trim() || '',
            email: cleanEmail,
            phone: (row.phone || '').trim() || null,
            isActive: true,
          },
        });
        importedCount++;
        results.push({
          row: rowNum,
          email: cleanEmail,
          status: 'IMPORTED',
          employeeId: created.id,
        });
      } catch (err: any) {
        failedCount++;
        results.push({
          row: rowNum,
          email: cleanEmail,
          status: 'FAILED',
          error: err.message || 'Database error during insertion',
        });
      }
    }

    return {
      companyId: dto.companyId,
      companyName: company.name,
      totalRows: rowsToProcess.length,
      importedCount,
      failedCount,
      results,
    };
  }
}
