import { Test, TestingModule } from '@nestjs/testing';
import { CutoffService } from './cutoff.service';
import { PrismaService } from '../prisma/prisma.service';
import { DayOfWeek } from '@prisma/client';

describe('CutoffService - Production Calendar & Timezone Logic (Item I)', () => {
  let service: CutoffService;
  let prismaMock: any;

  beforeEach(async () => {
    prismaMock = {
      kitchenSetting: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'default',
          cutoffTimeMinutes: 960, // 16:00
          cutoffWorkingDaysCount: 2,
          kitchenTimezone: 'Asia/Kolkata',
          dispatchBufferMinutes: 30,
          defaultPackagingBufferMinutes: 60,
        }),
      },
      kitchenWorkingDay: {
        findMany: jest.fn().mockResolvedValue([
          { dayOfWeek: DayOfWeek.MONDAY, isWorking: true },
          { dayOfWeek: DayOfWeek.TUESDAY, isWorking: true },
          { dayOfWeek: DayOfWeek.WEDNESDAY, isWorking: true },
          { dayOfWeek: DayOfWeek.THURSDAY, isWorking: true },
          { dayOfWeek: DayOfWeek.FRIDAY, isWorking: true },
          { dayOfWeek: DayOfWeek.SATURDAY, isWorking: false },
          { dayOfWeek: DayOfWeek.SUNDAY, isWorking: false },
        ]),
      },
      kitchenHoliday: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CutoffService,
        {
          provide: PrismaService,
          useValue: prismaMock,
        },
      ],
    }).compile();

    service = module.get<CutoffService>(CutoffService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // 1. Exact Cutoff for standard weekday delivery (Wednesday delivery -> Monday at 16:00)
  it('1. should calculate exact cutoff for Wednesday delivery as Monday at 16:00', async () => {
    // 2026-10-07 is Wednesday
    const cutoff = await service.calculateOrderCutoff('2026-10-07');

    expect(cutoff.leadWorkingDays).toBe(2);
    expect(cutoff.cutoffTimeMinutes).toBe(960);
    // Cutoff date is Monday 2026-10-05
    expect(cutoff.cutoffDate.toISOString().split('T')[0]).toBe('2026-10-05');

    // 16:00 Asia/Kolkata on 2026-10-05 is 10:30 UTC
    expect(cutoff.cutoffDateTime.toISOString()).toBe(
      '2026-10-05T10:30:00.000Z',
    );
  });

  // 2. Kitchen Weekend Skipped (Monday delivery -> Thursday at 16:00)
  it('2. should skip weekend days when counting lead days (Monday delivery -> Thursday 16:00)', async () => {
    // 2026-10-12 is Monday
    const cutoff = await service.calculateOrderCutoff('2026-10-12');

    // Skipping Sunday (Oct 11), Saturday (Oct 10), Friday (Oct 9, day 1), Thursday (Oct 8, day 2)
    expect(cutoff.cutoffDate.toISOString().split('T')[0]).toBe('2026-10-08');
    expect(cutoff.cutoffDateTime.toISOString()).toBe(
      '2026-10-08T10:30:00.000Z',
    );
  });

  // 3. Kitchen Holiday Skipped
  it('3. should skip kitchen holidays when counting lead days', async () => {
    // Delivery on Wednesday 2026-10-07. Tuesday 2026-10-06 is a kitchen holiday.
    prismaMock.kitchenHoliday.findMany.mockResolvedValueOnce([
      { date: new Date('2026-10-06T00:00:00.000Z'), name: 'Harvest Holiday' },
    ]);

    const cutoff = await service.calculateOrderCutoff('2026-10-07');

    // Tuesday skipped (holiday), Monday (day 1), Sunday skipped (weekend), Saturday skipped (weekend), Friday (day 2)
    expect(cutoff.cutoffDate.toISOString().split('T')[0]).toBe('2026-10-02');
    expect(cutoff.cutoffDateTime.toISOString()).toBe(
      '2026-10-02T10:30:00.000Z',
    );
  });

  // 4. Consecutive Kitchen Holidays Skipped
  it('4. should skip consecutive kitchen holidays correctly', async () => {
    // Delivery on Thursday 2026-10-08.
    // Wednesday 2026-10-07 and Tuesday 2026-10-06 are both holidays.
    prismaMock.kitchenHoliday.findMany.mockResolvedValueOnce([
      { date: new Date('2026-10-07T00:00:00.000Z'), name: 'Festival Day 2' },
      { date: new Date('2026-10-06T00:00:00.000Z'), name: 'Festival Day 1' },
    ]);

    const cutoff = await service.calculateOrderCutoff('2026-10-08');

    // Wed skipped (holiday), Tue skipped (holiday), Mon (day 1), Sun (skip), Sat (skip), Fri (day 2)
    expect(cutoff.cutoffDate.toISOString().split('T')[0]).toBe('2026-10-02');
  });

  // 5. Before Cutoff vs Exactly at Cutoff vs After Cutoff Detection
  it('5. should accurately detect before cutoff, exact cutoff, and after cutoff', async () => {
    // Delivery on Wednesday 2026-10-07. Cutoff is 2026-10-05T10:30:00.000Z.
    const deliveryDate = '2026-10-07';

    // A minute before cutoff: 10:29:00 UTC
    const before = new Date('2026-10-05T10:29:00.000Z');
    expect(await service.isCutoffPassed(deliveryDate, before)).toBe(false);

    // Exactly at cutoff: 10:30:00 UTC
    const exact = new Date('2026-10-05T10:30:00.000Z');
    expect(await service.isCutoffPassed(deliveryDate, exact)).toBe(true);

    // A minute after cutoff: 10:31:00 UTC
    const after = new Date('2026-10-05T10:31:00.000Z');
    expect(await service.isCutoffPassed(deliveryDate, after)).toBe(true);
  });

  // 6. Zero Lead Working Days (Cutoff on Delivery Day)
  it('6. should support 0 lead days (same-day cutoff)', async () => {
    prismaMock.kitchenSetting.findUnique.mockResolvedValueOnce({
      id: 'default',
      cutoffTimeMinutes: 600, // 10:00 AM
      cutoffWorkingDaysCount: 0,
      kitchenTimezone: 'Asia/Kolkata',
    });

    const cutoff = await service.calculateOrderCutoff('2026-10-07');
    expect(cutoff.cutoffDate.toISOString().split('T')[0]).toBe('2026-10-07');
    // 10:00 AM Kolkata = 04:30 UTC
    expect(cutoff.cutoffDateTime.toISOString()).toBe(
      '2026-10-07T04:30:00.000Z',
    );
  });
});
