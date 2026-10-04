import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DayOfWeek } from '@prisma/client';

export interface OrderCutoffInfo {
  deliveryDate: Date;
  cutoffDate: Date;
  cutoffDateTime: Date; // Exact UTC timestamp when cutoff happens
  cutoffTimeMinutes: number;
  leadWorkingDays: number;
  timezone: string;
}

@Injectable()
export class CutoffService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Returns current kitchen settings or default values.
   */
  async getKitchenSettings() {
    const setting = await this.prisma.kitchenSetting.findUnique({
      where: { id: 'default' },
    });

    return {
      cutoffTimeMinutes: setting?.cutoffTimeMinutes ?? 960, // 16:00
      cutoffWorkingDaysCount: setting?.cutoffWorkingDaysCount ?? 2,
      kitchenTimezone: setting?.kitchenTimezone ?? 'Asia/Kolkata',
      dispatchBufferMinutes: setting?.dispatchBufferMinutes ?? 30,
      defaultPackagingBufferMinutes:
        setting?.defaultPackagingBufferMinutes ?? 60,
    };
  }

  /**
   * Normalizes an input (string or Date) into a midnight-UTC calendar Date (YYYY-MM-DD).
   */
  normalizeCalendarDate(dateInput?: Date | string): Date {
    if (!dateInput) {
      dateInput = new Date();
    }
    if (typeof dateInput === 'string') {
      const parts = dateInput.split('T')[0].split('-').map(Number);
      if (
        parts.length !== 3 ||
        isNaN(parts[0]) ||
        isNaN(parts[1]) ||
        isNaN(parts[2])
      ) {
        throw new BadRequestException(
          `Invalid date format: '${dateInput}'. Expected YYYY-MM-DD.`,
        );
      }
      return new Date(Date.UTC(parts[0], parts[1] - 1, parts[2], 0, 0, 0, 0));
    }

    if (isNaN(dateInput.getTime())) {
      throw new BadRequestException(`Invalid date provided`);
    }

    return new Date(
      Date.UTC(
        dateInput.getUTCFullYear(),
        dateInput.getUTCMonth(),
        dateInput.getUTCDate(),
        0,
        0,
        0,
        0,
      ),
    );
  }

  /**
   * Converts a calendar date and minute-of-day in Asia/Kolkata (+05:30) to a UTC Date.
   * Asia/Kolkata is permanently UTC+05:30 (330 minutes ahead of UTC).
   */
  combineDateAndTimeInTimezone(
    calendarDate: Date,
    timeMinutes: number,
    _timezone = 'Asia/Kolkata',
  ): Date {
    const kolkataOffsetMs = 330 * 60 * 1000;
    // Midnight in Kolkata for calendarDate is: UTC(YYYY, MM, DD, 0, 0, 0) - 330 minutes
    const midnightUtcMs = calendarDate.getTime() - kolkataOffsetMs;
    // Add timeMinutes in milliseconds
    const exactUtcMs = midnightUtcMs + timeMinutes * 60 * 1000;
    return new Date(exactUtcMs);
  }

  /**
   * Maps a JavaScript UTC day index (0=Sunday..6=Saturday) to Prisma DayOfWeek.
   */
  private getDayOfWeek(dayIndex: number): DayOfWeek {
    const days: DayOfWeek[] = [
      DayOfWeek.SUNDAY,
      DayOfWeek.MONDAY,
      DayOfWeek.TUESDAY,
      DayOfWeek.WEDNESDAY,
      DayOfWeek.THURSDAY,
      DayOfWeek.FRIDAY,
      DayOfWeek.SATURDAY,
    ];
    return days[dayIndex];
  }

  /**
   * Calculates the exact cutoff timestamp for a delivery date based on the
   * Kitchen Production Calendar (skips kitchen non-working days & kitchen holidays).
   */
  async calculateOrderCutoff(
    deliveryDateInput: Date | string,
  ): Promise<OrderCutoffInfo> {
    const deliveryDate = this.normalizeCalendarDate(deliveryDateInput);
    const settings = await this.getKitchenSettings();

    // 1. Fetch kitchen working days configuration
    const workingDays = await this.prisma.kitchenWorkingDay.findMany();
    const workingDaysMap = new Map<DayOfWeek, boolean>();
    for (const wd of workingDays) {
      workingDaysMap.set(wd.dayOfWeek, wd.isWorking);
    }

    // Default fallback: Mon-Fri true, Sat-Sun false if DB empty
    const isDayWorking = (dow: DayOfWeek): boolean => {
      if (workingDaysMap.has(dow)) {
        return workingDaysMap.get(dow)!;
      }
      return dow !== DayOfWeek.SATURDAY && dow !== DayOfWeek.SUNDAY;
    };

    // 2. Fetch all kitchen holidays
    const holidays = await this.prisma.kitchenHoliday.findMany();
    const holidayDateStrings = new Set<string>(
      holidays.map((h) => {
        const d = this.normalizeCalendarDate(h.date);
        return d.toISOString().split('T')[0];
      }),
    );

    // 3. Count backwards `cutoffWorkingDaysCount` working days
    let remainingLeadDays = settings.cutoffWorkingDaysCount;

    if (remainingLeadDays <= 0) {
      // Cutoff is on the delivery day itself
      const cutoffDateTime = this.combineDateAndTimeInTimezone(
        deliveryDate,
        settings.cutoffTimeMinutes,
        settings.kitchenTimezone,
      );
      return {
        deliveryDate,
        cutoffDate: deliveryDate,
        cutoffDateTime,
        cutoffTimeMinutes: settings.cutoffTimeMinutes,
        leadWorkingDays: 0,
        timezone: settings.kitchenTimezone,
      };
    }

    const currentCursor = new Date(deliveryDate.getTime());
    let safetyCounter = 0;

    while (remainingLeadDays > 0) {
      safetyCounter++;
      if (safetyCounter > 365) {
        throw new BadRequestException(
          'Unable to calculate order cutoff: could not find sufficient kitchen working days within 365 days',
        );
      }

      // Step backwards 1 calendar day
      currentCursor.setUTCDate(currentCursor.getUTCDate() - 1);

      const dow = this.getDayOfWeek(currentCursor.getUTCDay());
      const dateString = currentCursor.toISOString().split('T')[0];

      // Check if day is working day and not a kitchen holiday
      const isWorkingDay = isDayWorking(dow);
      const isHoliday = holidayDateStrings.has(dateString);

      if (isWorkingDay && !isHoliday) {
        remainingLeadDays--;
      }
    }

    const cutoffDate = new Date(currentCursor.getTime());
    const cutoffDateTime = this.combineDateAndTimeInTimezone(
      cutoffDate,
      settings.cutoffTimeMinutes,
      settings.kitchenTimezone,
    );

    return {
      deliveryDate,
      cutoffDate,
      cutoffDateTime,
      cutoffTimeMinutes: settings.cutoffTimeMinutes,
      leadWorkingDays: settings.cutoffWorkingDaysCount,
      timezone: settings.kitchenTimezone,
    };
  }

  /**
   * Checks whether the order cutoff has already passed at a given reference time (defaults to now).
   */
  async isCutoffPassed(
    deliveryDateInput: Date | string,
    referenceTime: Date = new Date(),
  ): Promise<boolean> {
    const cutoffInfo = await this.calculateOrderCutoff(deliveryDateInput);
    return referenceTime.getTime() >= cutoffInfo.cutoffDateTime.getTime();
  }
}
