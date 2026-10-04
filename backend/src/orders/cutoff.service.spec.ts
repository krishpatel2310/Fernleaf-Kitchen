import { Test, TestingModule } from '@nestjs/testing';
import { CutoffService } from './cutoff.service';
import { PrismaService } from '../prisma/prisma.service';
import { DayOfWeek } from '@prisma/client';

describe('CutoffService - Production Calendar & Timezone Logic (Phase 10 Settings)', () => {
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
      companyHoliday: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      companyWorkingDay: {
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

  // 1. Default Monday-Friday calendar
  it('1. should calculate cutoff using default Monday-Friday working calendar', async () => {
    // 2026-10-09 is Friday. With 2 lead days (Thursday, Wednesday), cutoff is Wednesday 2026-10-07
    const cutoff = await service.calculateOrderCutoff('2026-10-09');
    expect(cutoff.cutoffDate.toISOString().split('T')[0]).toBe('2026-10-07');
    expect(cutoff.cutoffTimeMinutes).toBe(960);
    expect(cutoff.timezone).toBe('Asia/Kolkata');
  });

  // 2. Wednesday delivery with 2 working-day lead time
  it('2. should calculate Wednesday delivery with 2 working-day lead time as Monday 16:00 Asia/Kolkata', async () => {
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

  // 3. Kitchen holiday causes cutoff to move backward
  it('3. should shift cutoff backward when a kitchen holiday occurs within lead days', async () => {
    // Delivery on Wednesday 2026-10-07. Tuesday 2026-10-06 is a kitchen holiday.
    prismaMock.kitchenHoliday.findMany.mockResolvedValueOnce([
      { date: new Date('2026-10-06T00:00:00.000Z'), name: 'Harvest Holiday' },
    ]);

    const cutoff = await service.calculateOrderCutoff('2026-10-07');

    // Tuesday skipped (holiday), Monday (day 1), Sun/Sat skipped (weekend), Friday 2026-10-02 (day 2)
    expect(cutoff.cutoffDate.toISOString().split('T')[0]).toBe('2026-10-02');
    expect(cutoff.cutoffDateTime.toISOString()).toBe(
      '2026-10-02T10:30:00.000Z',
    );
  });

  // 4. Kitchen weekend/non-working day causes cutoff to move backward
  it('4. should shift cutoff backward over kitchen non-working days / weekends', async () => {
    // 2026-10-12 is Monday
    const cutoff = await service.calculateOrderCutoff('2026-10-12');

    // Skipping Sunday (Oct 11), Saturday (Oct 10), Friday (Oct 9, day 1), Thursday (Oct 8, day 2)
    expect(cutoff.cutoffDate.toISOString().split('T')[0]).toBe('2026-10-08');
    expect(cutoff.cutoffDateTime.toISOString()).toBe(
      '2026-10-08T10:30:00.000Z',
    );
  });

  // 5. Changing cutoff time changes calculated cutoff
  it('5. should reflect updated cutoff time immediately in calculated cutoff', async () => {
    // Change cutoff from 16:00 (960 min) to 15:00 (900 min)
    prismaMock.kitchenSetting.findUnique.mockResolvedValueOnce({
      id: 'default',
      cutoffTimeMinutes: 900, // 15:00
      cutoffWorkingDaysCount: 2,
      kitchenTimezone: 'Asia/Kolkata',
      dispatchBufferMinutes: 30,
      defaultPackagingBufferMinutes: 60,
    });

    const cutoff = await service.calculateOrderCutoff('2026-10-07');
    expect(cutoff.cutoffTimeMinutes).toBe(900);
    // 15:00 Asia/Kolkata on 2026-10-05 is 09:30 UTC
    expect(cutoff.cutoffDateTime.toISOString()).toBe(
      '2026-10-05T09:30:00.000Z',
    );
  });

  // 6. Changing working-day count changes calculated cutoff
  it('6. should reflect updated working-day lead time count immediately in calculated cutoff', async () => {
    // Change lead time from 2 days to 3 kitchen working days
    prismaMock.kitchenSetting.findUnique.mockResolvedValueOnce({
      id: 'default',
      cutoffTimeMinutes: 960,
      cutoffWorkingDaysCount: 3, // 3 working days
      kitchenTimezone: 'Asia/Kolkata',
      dispatchBufferMinutes: 30,
      defaultPackagingBufferMinutes: 60,
    });

    const cutoff = await service.calculateOrderCutoff('2026-10-07');
    expect(cutoff.leadWorkingDays).toBe(3);
    // Wednesday delivery with 3 working days: Tuesday (1), Monday (2), Sun/Sat skipped, Friday Oct 2 (3)
    expect(cutoff.cutoffDate.toISOString().split('T')[0]).toBe('2026-10-02');
    expect(cutoff.cutoffDateTime.toISOString()).toBe(
      '2026-10-02T10:30:00.000Z',
    );
  });

  // 7. Company holiday does NOT affect kitchen cutoff
  it('7. should NOT shift kitchen cutoff when a company holiday exists', async () => {
    // Even if Company has a holiday on Monday 2026-10-05
    prismaMock.companyHoliday.findMany.mockResolvedValueOnce([
      { date: new Date('2026-10-05T00:00:00.000Z'), name: 'Corporate Retreat' },
    ]);

    // CutoffService queries kitchenHoliday, NOT companyHoliday
    const cutoff = await service.calculateOrderCutoff('2026-10-07');

    // Kitchen cutoff remains Monday 2026-10-05 because kitchen is working on Monday!
    expect(cutoff.cutoffDate.toISOString().split('T')[0]).toBe('2026-10-05');
    expect(cutoff.cutoffDateTime.toISOString()).toBe(
      '2026-10-05T10:30:00.000Z',
    );
  });

  // 8. Company non-working day does NOT affect kitchen cutoff
  it('8. should NOT shift kitchen cutoff when a company non-working day exists', async () => {
    // Even if Company does not operate on Mondays
    prismaMock.companyWorkingDay.findMany.mockResolvedValueOnce([
      { dayOfWeek: DayOfWeek.MONDAY, isWorking: false },
    ]);

    const cutoff = await service.calculateOrderCutoff('2026-10-07');

    // Kitchen working days determine kitchen cutoff, so Monday remains cutoff day
    expect(cutoff.cutoffDate.toISOString().split('T')[0]).toBe('2026-10-05');
  });

  // 9. Kitchen holiday DOES affect kitchen cutoff
  it('9. should shift kitchen cutoff when a kitchen holiday is configured on the cutoff day', async () => {
    // Kitchen holiday on Monday 2026-10-05
    prismaMock.kitchenHoliday.findMany.mockResolvedValueOnce([
      {
        date: new Date('2026-10-05T00:00:00.000Z'),
        name: 'Kitchen Deep Clean',
      },
    ]);

    const cutoff = await service.calculateOrderCutoff('2026-10-07');

    // Shifter past Monday -> past Sunday/Sat -> Friday 2026-10-02
    expect(cutoff.cutoffDate.toISOString().split('T')[0]).toBe('2026-10-02');
    expect(cutoff.cutoffDateTime.toISOString()).toBe(
      '2026-10-02T10:30:00.000Z',
    );
  });

  // 10. Repeated cutoff processing remains idempotent
  it('10. should produce idempotent and deterministic results on repeated evaluations', async () => {
    const deliveryDate = '2026-10-07';
    const referenceTime = new Date('2026-10-05T10:30:00.000Z'); // Exact cutoff

    const run1 = await service.isCutoffPassed(deliveryDate, referenceTime);
    const run2 = await service.isCutoffPassed(deliveryDate, referenceTime);
    const run3 = await service.isCutoffPassed(deliveryDate, referenceTime);

    expect(run1).toBe(true);
    expect(run2).toBe(true);
    expect(run3).toBe(true);

    const beforeTime = new Date('2026-10-05T10:29:59.000Z');
    expect(await service.isCutoffPassed(deliveryDate, beforeTime)).toBe(false);
    expect(await service.isCutoffPassed(deliveryDate, beforeTime)).toBe(false);
  });

  // 11. Timezone remains Asia/Kolkata
  it('11. should preserve Asia/Kolkata (+05:30) timezone calculation regardless of host machine timezone', async () => {
    const calendarDate = service.normalizeCalendarDate('2026-10-05');
    // 16:00 is 960 minutes
    const utcDate = service.combineDateAndTimeInTimezone(
      calendarDate,
      960,
      'Asia/Kolkata',
    );

    // Midnight in Kolkata on 2026-10-05 is 2026-10-04T18:30:00.000Z
    // 18:30Z + 16h = 10:30Z on 2026-10-05
    expect(utcDate.toISOString()).toBe('2026-10-05T10:30:00.000Z');
  });

  // 12. Past cutoff processing uses current persisted settings correctly
  it('12. should dynamically query persisted settings for every cutoff calculation', async () => {
    // Initial call uses 2 days lead time
    const initial = await service.calculateOrderCutoff('2026-10-07');
    expect(initial.leadWorkingDays).toBe(2);
    expect(initial.cutoffDate.toISOString().split('T')[0]).toBe('2026-10-05');

    // Simulate settings mutation in DB to 1 day lead time
    prismaMock.kitchenSetting.findUnique.mockResolvedValueOnce({
      id: 'default',
      cutoffTimeMinutes: 960,
      cutoffWorkingDaysCount: 1, // Changed to 1 day
      kitchenTimezone: 'Asia/Kolkata',
      dispatchBufferMinutes: 30,
      defaultPackagingBufferMinutes: 60,
    });

    const updated = await service.calculateOrderCutoff('2026-10-07');
    expect(updated.leadWorkingDays).toBe(1);
    // Tuesday 2026-10-06 is 1 kitchen working day before Wednesday
    expect(updated.cutoffDate.toISOString().split('T')[0]).toBe('2026-10-06');
  });
});
