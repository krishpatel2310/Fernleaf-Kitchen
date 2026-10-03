import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DayOfWeek } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';
import {
  CreateCompanyAddressDto,
  UpdateCompanyAddressDto,
} from './dto/company-address.dto';
import {
  CreateCompanyHolidayDto,
  UpdateCompanyWorkingDayDto,
} from './dto/company-calendar.dto';
import { QueryCompanyDto } from './dto/query-company.dto';

const PUBLIC_EMAIL_DOMAINS = new Set([
  'gmail.com',
  'yahoo.com',
  'hotmail.com',
  'outlook.com',
  'live.com',
  'msn.com',
  'icloud.com',
  'aol.com',
  'mail.com',
  'proton.me',
  'protonmail.com',
  'zoho.com',
  'yandex.com',
  'gmx.com',
]);

@Injectable()
export class CompaniesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Normalizes domain name: lowercase, trims, removes leading '@'.
   */
  normalizeDomain(domain: string): string {
    let clean = domain.trim().toLowerCase();
    if (clean.startsWith('@')) {
      clean = clean.substring(1);
    }
    return clean;
  }

  /**
   * Validates domain format and rejects public domains (gmail, yahoo, etc.).
   */
  validateDomain(domain: string): string {
    const normalized = this.normalizeDomain(domain);
    const domainRegex =
      /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;

    if (!domainRegex.test(normalized)) {
      throw new BadRequestException(
        `Invalid corporate domain format: '${domain}'`,
      );
    }

    if (PUBLIC_EMAIL_DOMAINS.has(normalized)) {
      throw new BadRequestException(
        `Public email domains such as '${normalized}' are not allowed for corporate companies`,
      );
    }

    return normalized;
  }

  /**
   * Validates that default driver user is an active driver.
   */
  async validateDriverEligibility(driverUserId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: driverUserId },
      include: {
        role: {
          include: {
            permissions: {
              include: { permission: true },
            },
          },
        },
      },
    });

    if (!user) {
      throw new BadRequestException(
        `Driver with ID '${driverUserId}' not found`,
      );
    }

    if (user.status !== 'ACTIVE') {
      throw new BadRequestException(
        `Driver account '${driverUserId}' is not active`,
      );
    }

    const hasDriverPerm = user.role.permissions.some(
      (rp) => rp.permission.key === 'driver.read_own_deliveries',
    );

    if (user.role.name !== 'DRIVER' && !hasDriverPerm) {
      throw new BadRequestException(
        `User '${driverUserId}' does not have the DRIVER role or driver delivery permissions`,
      );
    }

    return user;
  }

  // ===========================================================================
  // COMPANY CRUD
  // ===========================================================================

  async findAll(query: QueryCompanyDto = {}) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (query.search) {
      const q = query.search.trim();
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { billingContactName: { contains: q, mode: 'insensitive' } },
        { billingContactEmail: { contains: q, mode: 'insensitive' } },
        {
          domains: {
            some: { domain: { contains: q, mode: 'insensitive' } },
          },
        },
      ];
    }

    const [total, data] = await Promise.all([
      this.prisma.company.count({ where }),
      this.prisma.company.findMany({
        where,
        skip,
        take: limit,
        include: {
          domains: true,
          priceTier: true,
          addresses: {
            where: { isActive: true },
          },
          defaultPackaging: true,
          defaultDriver: {
            select: { id: true, name: true, email: true },
          },
          _count: {
            select: {
              employees: true,
              orders: true,
            },
          },
        },
        orderBy: { name: 'asc' },
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
    const company = await this.prisma.company.findUnique({
      where: { id },
      include: {
        domains: true,
        addresses: true,
        workingDays: { orderBy: { dayOfWeek: 'asc' } },
        holidays: { orderBy: { date: 'asc' } },
        priceTier: true,
        ownerEmployee: true,
        defaultPackaging: true,
        defaultDriver: {
          select: { id: true, name: true, email: true },
        },
        hiddenCategories: { include: { category: true } },
        hiddenDishes: { include: { dish: true } },
        _count: {
          select: {
            employees: true,
            orders: true,
          },
        },
      },
    });

    if (!company) {
      throw new NotFoundException(`Company with ID '${id}' not found`);
    }

    return company;
  }

  async create(dto: CreateCompanyDto) {
    // 1. Validate domains
    if (!dto.domains || dto.domains.length === 0) {
      throw new BadRequestException(
        `At least one corporate email domain is required`,
      );
    }

    const normalizedDomains = Array.from(
      new Set(dto.domains.map((d) => this.validateDomain(d))),
    );

    // Check if any domain is already in use by another company
    const existingDomains =
      (await this.prisma.companyDomain.findMany({
        where: { domain: { in: normalizedDomains } },
      })) || [];

    if (existingDomains.length > 0) {
      throw new ConflictException(
        `Domain '${existingDomains[0].domain}' is already registered to another company`,
      );
    }

    // 2. Validate addresses
    if (!dto.addresses || dto.addresses.length === 0) {
      throw new BadRequestException(
        `At least one delivery address is required`,
      );
    }

    // 3. Validate packaging type
    const packaging = await this.prisma.packagingType.findUnique({
      where: { id: dto.defaultPackagingTypeId },
    });
    if (!packaging) {
      throw new BadRequestException(
        `Packaging type with ID '${dto.defaultPackagingTypeId}' does not exist`,
      );
    }

    // 4. Validate price tier if supplied
    if (dto.priceTierId) {
      const tier = await this.prisma.priceTier.findUnique({
        where: { id: dto.priceTierId },
      });
      if (!tier) {
        throw new BadRequestException(
          `Price tier with ID '${dto.priceTierId}' does not exist`,
        );
      }
    }

    // 5. Validate default driver if supplied
    if (dto.defaultDriverId) {
      await this.validateDriverEligibility(dto.defaultDriverId);
    }

    // 6. Execute atomic creation in transaction
    return this.prisma.$transaction(async (tx) => {
      const company = await tx.company.create({
        data: {
          name: dto.name.trim(),
          billingContactName: dto.billingContactName.trim(),
          billingContactEmail: dto.billingContactEmail.trim().toLowerCase(),
          billingContactPhone: dto.billingContactPhone?.trim(),
          defaultDeliveryTimeMinutes: dto.defaultDeliveryTimeMinutes,
          deliveryMinutesBefore: dto.deliveryMinutesBefore ?? 60,
          defaultPackagingTypeId: dto.defaultPackagingTypeId,
          defaultDriverId: dto.defaultDriverId,
          driverInstructions: dto.driverInstructions?.trim(),
          priceTierId: dto.priceTierId,
        },
      });

      // Create domains
      await tx.companyDomain.createMany({
        data: normalizedDomains.map((domain) => ({
          companyId: company.id,
          domain,
        })),
      });

      // Create addresses
      await tx.companyAddress.createMany({
        data: dto.addresses.map((addr) => ({
          companyId: company.id,
          label: addr.label.trim(),
          addressLine1: addr.addressLine1.trim(),
          addressLine2: addr.addressLine2?.trim(),
          city: addr.city.trim(),
          state: addr.state.trim(),
          postalCode: addr.postalCode.trim(),
          isActive: true,
        })),
      });

      // Initialize default working days: Mon-Fri working, Sat-Sun non-working
      const defaultWorkingDays: Array<{
        dayOfWeek: DayOfWeek;
        isWorking: boolean;
      }> = [
        { dayOfWeek: DayOfWeek.MONDAY, isWorking: true },
        { dayOfWeek: DayOfWeek.TUESDAY, isWorking: true },
        { dayOfWeek: DayOfWeek.WEDNESDAY, isWorking: true },
        { dayOfWeek: DayOfWeek.THURSDAY, isWorking: true },
        { dayOfWeek: DayOfWeek.FRIDAY, isWorking: true },
        { dayOfWeek: DayOfWeek.SATURDAY, isWorking: false },
        { dayOfWeek: DayOfWeek.SUNDAY, isWorking: false },
      ];

      await tx.companyWorkingDay.createMany({
        data: defaultWorkingDays.map((wd) => ({
          companyId: company.id,
          dayOfWeek: wd.dayOfWeek,
          isWorking: wd.isWorking,
        })),
      });

      return tx.company.findUnique({
        where: { id: company.id },
        include: {
          domains: true,
          addresses: true,
          workingDays: true,
          priceTier: true,
          defaultPackaging: true,
          defaultDriver: true,
        },
      });
    });
  }

  async update(id: string, dto: UpdateCompanyDto) {
    const company = await this.prisma.company.findUnique({ where: { id } });
    if (!company) {
      throw new NotFoundException(`Company with ID '${id}' not found`);
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

    if (dto.priceTierId) {
      const tier = await this.prisma.priceTier.findUnique({
        where: { id: dto.priceTierId },
      });
      if (!tier) {
        throw new BadRequestException(
          `Price tier with ID '${dto.priceTierId}' not found`,
        );
      }
    }

    if (dto.defaultDriverId) {
      await this.validateDriverEligibility(dto.defaultDriverId);
    }

    if (dto.ownerEmployeeId) {
      const employee = await this.prisma.employee.findUnique({
        where: { id: dto.ownerEmployeeId },
      });
      if (!employee) {
        throw new BadRequestException(
          `Employee with ID '${dto.ownerEmployeeId}' not found`,
        );
      }
      if (employee.companyId !== id) {
        throw new BadRequestException(
          `Employee '${dto.ownerEmployeeId}' does not belong to company '${id}'`,
        );
      }
    }

    return this.prisma.company.update({
      where: { id },
      data: {
        name: dto.name ? dto.name.trim() : undefined,
        billingContactName: dto.billingContactName
          ? dto.billingContactName.trim()
          : undefined,
        billingContactEmail: dto.billingContactEmail
          ? dto.billingContactEmail.trim().toLowerCase()
          : undefined,
        billingContactPhone:
          dto.billingContactPhone !== undefined
            ? dto.billingContactPhone?.trim()
            : undefined,
        defaultDeliveryTimeMinutes: dto.defaultDeliveryTimeMinutes,
        deliveryMinutesBefore: dto.deliveryMinutesBefore,
        defaultPackagingTypeId: dto.defaultPackagingTypeId,
        defaultDriverId: dto.defaultDriverId,
        driverInstructions:
          dto.driverInstructions !== undefined
            ? dto.driverInstructions?.trim()
            : undefined,
        priceTierId: dto.priceTierId,
        ownerEmployeeId: dto.ownerEmployeeId,
      },
      include: {
        domains: true,
        addresses: true,
        priceTier: true,
        ownerEmployee: true,
        defaultPackaging: true,
        defaultDriver: true,
      },
    });
  }

  // ===========================================================================
  // DOMAIN MANAGEMENT
  // ===========================================================================

  async addDomain(companyId: string, rawDomain: string) {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
    });
    if (!company) {
      throw new NotFoundException(`Company with ID '${companyId}' not found`);
    }

    const domain = this.validateDomain(rawDomain);

    const existing = await this.prisma.companyDomain.findUnique({
      where: { domain },
    });

    if (existing) {
      throw new ConflictException(
        `Domain '${domain}' is already registered to ${
          existing.companyId === companyId ? 'this company' : 'another company'
        }`,
      );
    }

    return this.prisma.companyDomain.create({
      data: { companyId, domain },
    });
  }

  async removeDomain(companyId: string, domainId: string) {
    const domain = await this.prisma.companyDomain.findUnique({
      where: { id: domainId },
    });

    if (!domain || domain.companyId !== companyId) {
      throw new NotFoundException(
        `Domain with ID '${domainId}' not found for company '${companyId}'`,
      );
    }

    // Ensure company maintains at least one domain
    const count = await this.prisma.companyDomain.count({
      where: { companyId },
    });

    if (count <= 1) {
      throw new BadRequestException(
        `Cannot remove domain: company must maintain at least one domain`,
      );
    }

    return this.prisma.companyDomain.delete({
      where: { id: domainId },
    });
  }

  // ===========================================================================
  // ADDRESS MANAGEMENT
  // ===========================================================================

  async addAddress(companyId: string, dto: CreateCompanyAddressDto) {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
    });
    if (!company) {
      throw new NotFoundException(`Company with ID '${companyId}' not found`);
    }

    return this.prisma.companyAddress.create({
      data: {
        companyId,
        label: dto.label.trim(),
        addressLine1: dto.addressLine1.trim(),
        addressLine2: dto.addressLine2?.trim(),
        city: dto.city.trim(),
        state: dto.state.trim(),
        postalCode: dto.postalCode.trim(),
        isActive: true,
      },
    });
  }

  async updateAddress(
    companyId: string,
    addressId: string,
    dto: UpdateCompanyAddressDto,
  ) {
    const address = await this.prisma.companyAddress.findUnique({
      where: { id: addressId },
    });

    if (!address || address.companyId !== companyId) {
      throw new NotFoundException(
        `Address with ID '${addressId}' not found for company '${companyId}'`,
      );
    }

    // If deactivating address, verify at least one active address remains
    if (dto.isActive === false) {
      const activeCount = await this.prisma.companyAddress.count({
        where: { companyId, isActive: true },
      });
      if (activeCount <= 1) {
        throw new BadRequestException(
          `Cannot deactivate address: company must have at least one active delivery address`,
        );
      }
    }

    return this.prisma.companyAddress.update({
      where: { id: addressId },
      data: {
        label: dto.label ? dto.label.trim() : undefined,
        addressLine1: dto.addressLine1 ? dto.addressLine1.trim() : undefined,
        addressLine2:
          dto.addressLine2 !== undefined ? dto.addressLine2?.trim() : undefined,
        city: dto.city ? dto.city.trim() : undefined,
        state: dto.state ? dto.state.trim() : undefined,
        postalCode: dto.postalCode ? dto.postalCode.trim() : undefined,
        isActive: dto.isActive,
      },
    });
  }

  // ===========================================================================
  // CALENDAR MANAGEMENT (WORKING DAYS & HOLIDAYS)
  // ===========================================================================

  async updateWorkingDay(companyId: string, dto: UpdateCompanyWorkingDayDto) {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
    });
    if (!company) {
      throw new NotFoundException(`Company with ID '${companyId}' not found`);
    }

    return this.prisma.companyWorkingDay.upsert({
      where: {
        companyId_dayOfWeek: { companyId, dayOfWeek: dto.dayOfWeek },
      },
      create: {
        companyId,
        dayOfWeek: dto.dayOfWeek,
        isWorking: dto.isWorking,
      },
      update: {
        isWorking: dto.isWorking,
      },
    });
  }

  async addHoliday(companyId: string, dto: CreateCompanyHolidayDto) {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
    });
    if (!company) {
      throw new NotFoundException(`Company with ID '${companyId}' not found`);
    }

    const dateObj = new Date(dto.date);
    if (isNaN(dateObj.getTime())) {
      throw new BadRequestException(
        `Invalid date format for holiday: '${dto.date}'`,
      );
    }

    // Normalize date to start of day in UTC / Date only
    const normalizedDate = new Date(
      Date.UTC(
        dateObj.getUTCFullYear(),
        dateObj.getUTCMonth(),
        dateObj.getUTCDate(),
      ),
    );

    const existing = await this.prisma.companyHoliday.findUnique({
      where: {
        companyId_date: { companyId, date: normalizedDate },
      },
    });

    if (existing) {
      throw new ConflictException(
        `Holiday on date '${dto.date}' already exists for this company`,
      );
    }

    return this.prisma.companyHoliday.create({
      data: {
        companyId,
        date: normalizedDate,
        name: dto.name.trim(),
      },
    });
  }

  async removeHoliday(companyId: string, holidayId: string) {
    const holiday = await this.prisma.companyHoliday.findUnique({
      where: { id: holidayId },
    });

    if (!holiday || holiday.companyId !== companyId) {
      throw new NotFoundException(
        `Holiday with ID '${holidayId}' not found for company '${companyId}'`,
      );
    }

    return this.prisma.companyHoliday.delete({
      where: { id: holidayId },
    });
  }

  /**
   * Evaluates if a company can receive delivery on a specific date.
   * Company working days & company holidays govern company delivery calendar.
   */
  async isDeliveryDay(companyId: string, date: Date | string) {
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    if (isNaN(dateObj.getTime())) {
      throw new BadRequestException(`Invalid date: '${date}'`);
    }

    const normalizedDate = new Date(
      Date.UTC(
        dateObj.getUTCFullYear(),
        dateObj.getUTCMonth(),
        dateObj.getUTCDate(),
      ),
    );

    // 1. Check company holiday
    const holiday = await this.prisma.companyHoliday.findUnique({
      where: {
        companyId_date: { companyId, date: normalizedDate },
      },
    });

    if (holiday) {
      return {
        canDeliver: false,
        reason: `Company holiday: ${holiday.name}`,
      };
    }

    // 2. Check company working day
    const dayIndex = normalizedDate.getUTCDay(); // 0 is Sunday, 1 is Monday...
    const dayMap: Record<number, DayOfWeek> = {
      0: DayOfWeek.SUNDAY,
      1: DayOfWeek.MONDAY,
      2: DayOfWeek.TUESDAY,
      3: DayOfWeek.WEDNESDAY,
      4: DayOfWeek.THURSDAY,
      5: DayOfWeek.FRIDAY,
      6: DayOfWeek.SATURDAY,
    };

    const dayOfWeek = dayMap[dayIndex];
    const workingDay = await this.prisma.companyWorkingDay.findUnique({
      where: {
        companyId_dayOfWeek: { companyId, dayOfWeek },
      },
    });

    // If record exists, check isWorking; default to Mon-Fri if record missing
    const isWorking =
      workingDay !== null
        ? workingDay.isWorking
        : dayIndex >= 1 && dayIndex <= 5;

    if (!isWorking) {
      return {
        canDeliver: false,
        reason: `Company non-working day (${dayOfWeek})`,
      };
    }

    return {
      canDeliver: true,
      reason: 'Working day',
    };
  }
}
