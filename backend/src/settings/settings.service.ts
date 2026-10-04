import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DayOfWeek } from '@prisma/client';
import {
  KitchenWorkingDayDto,
  UpdateKitchenWorkingDaysDto,
} from './dto/kitchen-working-day.dto';
import { UpdateKitchenSettingsDto } from './dto/update-kitchen-settings.dto';
import { CreateKitchenHolidayDto } from './dto/kitchen-holiday.dto';

const DAY_ORDER: Record<DayOfWeek, number> = {
  [DayOfWeek.MONDAY]: 1,
  [DayOfWeek.TUESDAY]: 2,
  [DayOfWeek.WEDNESDAY]: 3,
  [DayOfWeek.THURSDAY]: 4,
  [DayOfWeek.FRIDAY]: 5,
  [DayOfWeek.SATURDAY]: 6,
  [DayOfWeek.SUNDAY]: 7,
};

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Converts HH:mm string to minutes from midnight (0..1439).
   */
  parseCutoffTimeToMinutes(timeStr: string): number {
    const match = /^([0-1]?[0-9]|2[0-3]):([0-5][0-9])$/.exec(timeStr);
    if (!match) {
      throw new BadRequestException(
        `Invalid cutoff time format: '${timeStr}'. Expected HH:mm in 24-hour format (e.g. '16:00').`,
      );
    }
    const hours = parseInt(match[1], 10);
    const minutes = parseInt(match[2], 10);
    return hours * 60 + minutes;
  }

  /**
   * Converts minutes from midnight into 24-hour HH:mm string.
   */
  formatMinutesToTime(minutes: number): string {
    const hours = Math.floor(minutes / 60)
      .toString()
      .padStart(2, '0');
    const mins = (minutes % 60).toString().padStart(2, '0');
    return `${hours}:${mins}`;
  }

  /**
   * Validates and normalizes calendar date string (YYYY-MM-DD) to UTC midnight Date.
   * Strictly validates calendar existence (e.g., rejects 2026-02-30).
   */
  parseAndValidateCalendarDate(input: string | Date): Date {
    if (input instanceof Date) {
      if (isNaN(input.getTime())) {
        throw new BadRequestException('Invalid date provided');
      }
      return new Date(
        Date.UTC(
          input.getUTCFullYear(),
          input.getUTCMonth(),
          input.getUTCDate(),
          0,
          0,
          0,
          0,
        ),
      );
    }

    if (typeof input !== 'string') {
      throw new BadRequestException('Date must be a string or Date object');
    }

    const datePart = input.split('T')[0].trim();
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(datePart);
    if (!match) {
      throw new BadRequestException(
        `Invalid date format: '${input}'. Expected YYYY-MM-DD.`,
      );
    }

    const year = parseInt(match[1], 10);
    const month = parseInt(match[2], 10);
    const day = parseInt(match[3], 10);

    if (month < 1 || month > 12) {
      throw new BadRequestException(`Invalid month in date: ${month}`);
    }
    if (day < 1 || day > 31) {
      throw new BadRequestException(`Invalid day in date: ${day}`);
    }

    const dateObj = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
    if (
      dateObj.getUTCFullYear() !== year ||
      dateObj.getUTCMonth() !== month - 1 ||
      dateObj.getUTCDate() !== day
    ) {
      throw new BadRequestException(
        `Invalid calendar date: '${datePart}' does not exist on the calendar.`,
      );
    }

    return dateObj;
  }

  /**
   * Gets the authoritative composite kitchen settings including formatted cutoff time,
   * working days (ordered Mon-Sun), and holidays (ordered date asc).
   */
  async getKitchenSettings() {
    let settings = await this.prisma.kitchenSetting.findUnique({
      where: { id: 'default' },
    });

    if (!settings) {
      settings = await this.prisma.kitchenSetting.create({
        data: {
          id: 'default',
          cutoffTimeMinutes: 960, // 16:00
          cutoffWorkingDaysCount: 2,
          kitchenTimezone: 'Asia/Kolkata',
          dispatchBufferMinutes: 30,
          defaultPackagingBufferMinutes: 60,
        },
      });
    }

    const workingDays = await this.getKitchenWorkingDays();
    const holidays = await this.getKitchenHolidays();

    return {
      id: settings.id,
      cutoffTime: this.formatMinutesToTime(settings.cutoffTimeMinutes),
      cutoffTimeMinutes: settings.cutoffTimeMinutes,
      cutoffWorkingDaysCount: settings.cutoffWorkingDaysCount,
      kitchenTimezone: settings.kitchenTimezone,
      dispatchBufferMinutes: settings.dispatchBufferMinutes,
      defaultPackagingBufferMinutes: settings.defaultPackagingBufferMinutes,
      workingDays,
      holidays,
      createdAt: settings.createdAt,
      updatedAt: settings.updatedAt,
    };
  }

  /**
   * Updates kitchen settings atomically in a single transaction.
   */
  async updateKitchenSettings(dto: UpdateKitchenSettingsDto) {
    let cutoffMinutes: number | undefined;

    if (dto.cutoffTime !== undefined) {
      cutoffMinutes = this.parseCutoffTimeToMinutes(dto.cutoffTime);
    } else if (dto.cutoffTimeMinutes !== undefined) {
      if (
        !Number.isInteger(dto.cutoffTimeMinutes) ||
        dto.cutoffTimeMinutes < 0 ||
        dto.cutoffTimeMinutes > 1439
      ) {
        throw new BadRequestException(
          'cutoffTimeMinutes must be an integer between 0 and 1439 (23:59)',
        );
      }
      cutoffMinutes = dto.cutoffTimeMinutes;
    }

    if (dto.cutoffWorkingDaysCount !== undefined) {
      if (
        !Number.isInteger(dto.cutoffWorkingDaysCount) ||
        dto.cutoffWorkingDaysCount <= 0
      ) {
        throw new BadRequestException(
          'cutoffWorkingDaysCount must be a positive integer (at least 1)',
        );
      }
      if (dto.cutoffWorkingDaysCount > 30) {
        throw new BadRequestException(
          'cutoffWorkingDaysCount cannot exceed 30 days',
        );
      }
    }

    if (dto.dispatchBufferMinutes !== undefined) {
      if (
        !Number.isInteger(dto.dispatchBufferMinutes) ||
        dto.dispatchBufferMinutes < 0
      ) {
        throw new BadRequestException(
          'dispatchBufferMinutes must be a non-negative integer',
        );
      }
    }

    if (dto.defaultPackagingBufferMinutes !== undefined) {
      if (
        !Number.isInteger(dto.defaultPackagingBufferMinutes) ||
        dto.defaultPackagingBufferMinutes < 0
      ) {
        throw new BadRequestException(
          'defaultPackagingBufferMinutes must be a non-negative integer',
        );
      }
    }

    if (dto.kitchenTimezone !== undefined) {
      if (
        typeof dto.kitchenTimezone !== 'string' ||
        !dto.kitchenTimezone.trim()
      ) {
        throw new BadRequestException('kitchenTimezone must not be empty');
      }
    }

    // Validate working days if provided
    if (dto.workingDays && dto.workingDays.length > 0) {
      const seenDays = new Set<DayOfWeek>();
      for (const wd of dto.workingDays) {
        if (!Object.values(DayOfWeek).includes(wd.dayOfWeek)) {
          throw new BadRequestException(`Invalid dayOfWeek: '${wd.dayOfWeek}'`);
        }
        if (typeof wd.isWorking !== 'boolean') {
          throw new BadRequestException(
            `isWorking for '${wd.dayOfWeek}' must be a boolean`,
          );
        }
        if (seenDays.has(wd.dayOfWeek)) {
          throw new BadRequestException(
            `Duplicate weekday '${wd.dayOfWeek}' in configuration payload`,
          );
        }
        seenDays.add(wd.dayOfWeek);
      }

      // Check merged working days to ensure at least one remains enabled
      const existing = await this.prisma.kitchenWorkingDay.findMany();
      const mergedMap = new Map<DayOfWeek, boolean>();
      for (const e of existing) {
        mergedMap.set(e.dayOfWeek, e.isWorking);
      }
      for (const update of dto.workingDays) {
        mergedMap.set(update.dayOfWeek, update.isWorking);
      }

      const activeWorkingCount = Array.from(mergedMap.values()).filter(
        (isWorking) => isWorking,
      ).length;

      if (activeWorkingCount === 0) {
        throw new BadRequestException(
          'At least one kitchen working day must be enabled',
        );
      }
    }

    // Atomic update
    await this.prisma.$transaction(async (tx) => {
      await tx.kitchenSetting.upsert({
        where: { id: 'default' },
        create: {
          id: 'default',
          cutoffTimeMinutes: cutoffMinutes ?? 960,
          cutoffWorkingDaysCount: dto.cutoffWorkingDaysCount ?? 2,
          kitchenTimezone: dto.kitchenTimezone?.trim() ?? 'Asia/Kolkata',
          dispatchBufferMinutes: dto.dispatchBufferMinutes ?? 30,
          defaultPackagingBufferMinutes:
            dto.defaultPackagingBufferMinutes ?? 60,
        },
        update: {
          ...(cutoffMinutes !== undefined && {
            cutoffTimeMinutes: cutoffMinutes,
          }),
          ...(dto.cutoffWorkingDaysCount !== undefined && {
            cutoffWorkingDaysCount: dto.cutoffWorkingDaysCount,
          }),
          ...(dto.kitchenTimezone !== undefined && {
            kitchenTimezone: dto.kitchenTimezone.trim(),
          }),
          ...(dto.dispatchBufferMinutes !== undefined && {
            dispatchBufferMinutes: dto.dispatchBufferMinutes,
          }),
          ...(dto.defaultPackagingBufferMinutes !== undefined && {
            defaultPackagingBufferMinutes: dto.defaultPackagingBufferMinutes,
          }),
        },
      });

      if (dto.workingDays && dto.workingDays.length > 0) {
        for (const wd of dto.workingDays) {
          await tx.kitchenWorkingDay.upsert({
            where: { dayOfWeek: wd.dayOfWeek },
            create: { dayOfWeek: wd.dayOfWeek, isWorking: wd.isWorking },
            update: { isWorking: wd.isWorking },
          });
        }
      }
    });

    return this.getKitchenSettings();
  }

  /**
   * Retrieves all kitchen working days ordered from Monday to Sunday.
   */
  async getKitchenWorkingDays() {
    const days = await this.prisma.kitchenWorkingDay.findMany();
    return days.sort(
      (a, b) => (DAY_ORDER[a.dayOfWeek] || 0) - (DAY_ORDER[b.dayOfWeek] || 0),
    );
  }

  /**
   * Updates kitchen working days (either full list or partial updates),
   * enforcing no duplicates and that at least one day remains active.
   */
  async updateKitchenWorkingDays(
    payload:
      | KitchenWorkingDayDto[]
      | UpdateKitchenWorkingDaysDto
      | KitchenWorkingDayDto,
  ) {
    let daysArray: KitchenWorkingDayDto[];

    if (Array.isArray(payload)) {
      daysArray = payload;
    } else if ('workingDays' in payload && Array.isArray(payload.workingDays)) {
      daysArray = payload.workingDays;
    } else if ('dayOfWeek' in payload && 'isWorking' in payload) {
      daysArray = [payload as KitchenWorkingDayDto];
    } else {
      throw new BadRequestException(
        'Expected an array of working days or an object with workingDays',
      );
    }

    if (daysArray.length === 0) {
      throw new BadRequestException('workingDays cannot be empty');
    }

    const seenDays = new Set<DayOfWeek>();
    for (const wd of daysArray) {
      if (!Object.values(DayOfWeek).includes(wd.dayOfWeek)) {
        throw new BadRequestException(`Invalid dayOfWeek: '${wd.dayOfWeek}'`);
      }
      if (typeof wd.isWorking !== 'boolean') {
        throw new BadRequestException(
          `isWorking for '${wd.dayOfWeek}' must be a boolean`,
        );
      }
      if (seenDays.has(wd.dayOfWeek)) {
        throw new BadRequestException(
          `Duplicate weekday '${wd.dayOfWeek}' in configuration payload`,
        );
      }
      seenDays.add(wd.dayOfWeek);
    }

    // Fetch existing days to check merged state
    const existing = await this.prisma.kitchenWorkingDay.findMany();
    const mergedMap = new Map<DayOfWeek, boolean>();
    for (const e of existing) {
      mergedMap.set(e.dayOfWeek, e.isWorking);
    }
    for (const update of daysArray) {
      mergedMap.set(update.dayOfWeek, update.isWorking);
    }

    const activeWorkingCount = Array.from(mergedMap.values()).filter(
      (isWorking) => isWorking,
    ).length;

    if (activeWorkingCount === 0) {
      throw new BadRequestException(
        'At least one kitchen working day must be enabled',
      );
    }

    // Atomic update
    await this.prisma.$transaction(async (tx) => {
      for (const wd of daysArray) {
        await tx.kitchenWorkingDay.upsert({
          where: { dayOfWeek: wd.dayOfWeek },
          create: { dayOfWeek: wd.dayOfWeek, isWorking: wd.isWorking },
          update: { isWorking: wd.isWorking },
        });
      }
    });

    return this.getKitchenWorkingDays();
  }

  /**
   * Retrieves all kitchen holidays ordered by calendar date ascending.
   */
  async getKitchenHolidays() {
    return this.prisma.kitchenHoliday.findMany({
      orderBy: { date: 'asc' },
    });
  }

  /**
   * Adds a kitchen holiday. Rejects duplicates with 409 Conflict.
   */
  async addKitchenHoliday(dto: CreateKitchenHolidayDto) {
    if (!dto.name || !dto.name.trim()) {
      throw new BadRequestException('Holiday name cannot be empty');
    }

    const normalizedDate = this.parseAndValidateCalendarDate(dto.date);
    const dateStr = normalizedDate.toISOString().split('T')[0];

    const existing = await this.prisma.kitchenHoliday.findUnique({
      where: { date: normalizedDate },
    });

    if (existing) {
      throw new ConflictException(
        `Kitchen holiday on date '${dateStr}' already exists: '${existing.name}'`,
      );
    }

    return this.prisma.kitchenHoliday.create({
      data: {
        date: normalizedDate,
        name: dto.name.trim(),
      },
    });
  }

  /**
   * Removes a kitchen holiday by CUID or YYYY-MM-DD date.
   */
  async removeKitchenHoliday(identifier: string) {
    if (!identifier || !identifier.trim()) {
      throw new BadRequestException('Holiday identifier cannot be empty');
    }

    const cleanIdentifier = identifier.trim();

    let holiday = await this.prisma.kitchenHoliday.findUnique({
      where: { id: cleanIdentifier },
    });

    if (!holiday) {
      try {
        const normalizedDate =
          this.parseAndValidateCalendarDate(cleanIdentifier);
        holiday = await this.prisma.kitchenHoliday.findUnique({
          where: { date: normalizedDate },
        });
      } catch {
        // Not a date string, ignore
      }
    }

    if (!holiday) {
      throw new NotFoundException(
        `Kitchen holiday '${cleanIdentifier}' not found`,
      );
    }

    await this.prisma.kitchenHoliday.delete({
      where: { id: holiday.id },
    });

    return {
      success: true,
      message: `Kitchen holiday '${holiday.name}' (${holiday.date.toISOString().split('T')[0]}) removed`,
      holiday,
    };
  }
}
