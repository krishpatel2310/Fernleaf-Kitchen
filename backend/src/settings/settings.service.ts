import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

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

    return settings;
  }

  async getKitchenWorkingDays() {
    return this.prisma.kitchenWorkingDay.findMany({
      orderBy: { dayOfWeek: 'asc' },
    });
  }

  async getKitchenHolidays() {
    return this.prisma.kitchenHoliday.findMany({
      orderBy: { date: 'asc' },
    });
  }
}
