import { Test, TestingModule } from '@nestjs/testing';
import { SettingsService } from './settings.service';
import { PrismaService } from '../prisma/prisma.service';
import { DayOfWeek } from '@prisma/client';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';

describe('SettingsService - Phase 10 Operational Settings', () => {
  let service: SettingsService;
  let prismaMock: any;

  const mockDefaultSettings = {
    id: 'default',
    cutoffTimeMinutes: 960, // 16:00
    cutoffWorkingDaysCount: 2,
    kitchenTimezone: 'Asia/Kolkata',
    dispatchBufferMinutes: 30,
    defaultPackagingBufferMinutes: 60,
    createdAt: new Date('2026-10-01T00:00:00.000Z'),
    updatedAt: new Date('2026-10-01T00:00:00.000Z'),
  };

  const mockWorkingDays = [
    { id: 'wd1', dayOfWeek: DayOfWeek.MONDAY, isWorking: true },
    { id: 'wd2', dayOfWeek: DayOfWeek.TUESDAY, isWorking: true },
    { id: 'wd3', dayOfWeek: DayOfWeek.WEDNESDAY, isWorking: true },
    { id: 'wd4', dayOfWeek: DayOfWeek.THURSDAY, isWorking: true },
    { id: 'wd5', dayOfWeek: DayOfWeek.FRIDAY, isWorking: true },
    { id: 'wd6', dayOfWeek: DayOfWeek.SATURDAY, isWorking: false },
    { id: 'wd7', dayOfWeek: DayOfWeek.SUNDAY, isWorking: false },
  ];

  const mockHolidays = [
    {
      id: 'h1',
      date: new Date('2026-05-01T00:00:00.000Z'),
      name: 'May Day (Kitchen Deep Clean)',
    },
    {
      id: 'h2',
      date: new Date('2026-11-10T00:00:00.000Z'),
      name: 'Diwali Kitchen Holiday',
    },
  ];

  beforeEach(async () => {
    prismaMock = {
      kitchenSetting: {
        findUnique: jest.fn().mockResolvedValue({ ...mockDefaultSettings }),
        create: jest.fn().mockImplementation((args) => ({ ...args.data })),
        upsert: jest.fn().mockImplementation((args) => ({
          ...mockDefaultSettings,
          ...args.update,
        })),
      },
      kitchenWorkingDay: {
        findMany: jest.fn().mockResolvedValue([...mockWorkingDays]),
        upsert: jest.fn().mockImplementation((args) => ({
          id: 'wd-mock',
          ...args.create,
          ...args.update,
        })),
      },
      kitchenHoliday: {
        findMany: jest.fn().mockResolvedValue([...mockHolidays]),
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockImplementation((args) => ({
          id: 'h-new',
          ...args.data,
        })),
        delete: jest.fn().mockImplementation((args) => ({
          id: args.where.id,
          date: new Date('2026-05-01T00:00:00.000Z'),
          name: 'Deleted Holiday',
        })),
      },
      $transaction: jest.fn().mockImplementation(async (callback) => {
        return callback(prismaMock);
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SettingsService,
        {
          provide: PrismaService,
          useValue: prismaMock,
        },
      ],
    }).compile();

    service = module.get<SettingsService>(SettingsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getKitchenSettings', () => {
    it('should return composite kitchen settings with formatted cutoff time and sorted working days', async () => {
      const res = await service.getKitchenSettings();

      expect(res.id).toBe('default');
      expect(res.cutoffTime).toBe('16:00');
      expect(res.cutoffTimeMinutes).toBe(960);
      expect(res.cutoffWorkingDaysCount).toBe(2);
      expect(res.kitchenTimezone).toBe('Asia/Kolkata');
      expect(res.workingDays).toHaveLength(7);
      expect(res.workingDays[0].dayOfWeek).toBe(DayOfWeek.MONDAY);
      expect(res.workingDays[6].dayOfWeek).toBe(DayOfWeek.SUNDAY);
      expect(res.holidays).toHaveLength(2);
    });

    it('should create default settings if record does not exist', async () => {
      prismaMock.kitchenSetting.findUnique.mockResolvedValueOnce(null);

      const res = await service.getKitchenSettings();
      expect(prismaMock.kitchenSetting.create).toHaveBeenCalled();
      expect(res.cutoffTime).toBe('16:00');
    });
  });

  describe('updateKitchenSettings', () => {
    it('should update cutoffTime and convert to minutes atomically', async () => {
      const res = await service.updateKitchenSettings({
        cutoffTime: '15:30',
      });

      expect(prismaMock.$transaction).toHaveBeenCalled();
      expect(res.cutoffTimeMinutes).toBe(960); // mock getKitchenSettings return
    });

    it('should reject invalid cutoffTime format', async () => {
      await expect(
        service.updateKitchenSettings({ cutoffTime: '25:00' }),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.updateKitchenSettings({ cutoffTime: 'invalid' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should update cutoffWorkingDaysCount and reject non-positive values', async () => {
      await expect(
        service.updateKitchenSettings({ cutoffWorkingDaysCount: 0 }),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.updateKitchenSettings({ cutoffWorkingDaysCount: -1 }),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.updateKitchenSettings({ cutoffWorkingDaysCount: 1.5 }),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.updateKitchenSettings({ cutoffWorkingDaysCount: 31 }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject negative buffer minutes', async () => {
      await expect(
        service.updateKitchenSettings({ dispatchBufferMinutes: -10 }),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.updateKitchenSettings({ defaultPackagingBufferMinutes: -5 }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject empty kitchen timezone', async () => {
      await expect(
        service.updateKitchenSettings({ kitchenTimezone: '   ' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject duplicate weekdays in workingDays update', async () => {
      await expect(
        service.updateKitchenSettings({
          workingDays: [
            { dayOfWeek: DayOfWeek.MONDAY, isWorking: true },
            { dayOfWeek: DayOfWeek.MONDAY, isWorking: false },
          ],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject disabling all kitchen working days', async () => {
      await expect(
        service.updateKitchenSettings({
          workingDays: [
            { dayOfWeek: DayOfWeek.MONDAY, isWorking: false },
            { dayOfWeek: DayOfWeek.TUESDAY, isWorking: false },
            { dayOfWeek: DayOfWeek.WEDNESDAY, isWorking: false },
            { dayOfWeek: DayOfWeek.THURSDAY, isWorking: false },
            { dayOfWeek: DayOfWeek.FRIDAY, isWorking: false },
            { dayOfWeek: DayOfWeek.SATURDAY, isWorking: false },
            { dayOfWeek: DayOfWeek.SUNDAY, isWorking: false },
          ],
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('updateKitchenWorkingDays', () => {
    it('should update working days and return sorted list', async () => {
      const res = await service.updateKitchenWorkingDays([
        { dayOfWeek: DayOfWeek.SATURDAY, isWorking: true },
      ]);

      expect(prismaMock.kitchenWorkingDay.upsert).toHaveBeenCalledWith({
        where: { dayOfWeek: DayOfWeek.SATURDAY },
        create: { dayOfWeek: DayOfWeek.SATURDAY, isWorking: true },
        update: { isWorking: true },
      });
      expect(res).toBeDefined();
    });

    it('should reject empty payload', async () => {
      await expect(service.updateKitchenWorkingDays([])).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should reject duplicate days in payload', async () => {
      await expect(
        service.updateKitchenWorkingDays([
          { dayOfWeek: DayOfWeek.FRIDAY, isWorking: true },
          { dayOfWeek: DayOfWeek.FRIDAY, isWorking: false },
        ]),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('addKitchenHoliday', () => {
    it('should add holiday with normalized UTC date', async () => {
      const res = await service.addKitchenHoliday({
        date: '2026-08-15',
        name: 'Independence Day',
      });

      expect(res.name).toBe('Independence Day');
      expect(prismaMock.kitchenHoliday.create).toHaveBeenCalledWith({
        data: {
          date: new Date(Date.UTC(2026, 7, 15, 0, 0, 0, 0)),
          name: 'Independence Day',
        },
      });
    });

    it('should reject duplicate holiday on same calendar date with 409 Conflict', async () => {
      prismaMock.kitchenHoliday.findUnique.mockResolvedValueOnce({
        id: 'h-existing',
        date: new Date('2026-08-15T00:00:00.000Z'),
        name: 'Existing Holiday',
      });

      await expect(
        service.addKitchenHoliday({
          date: '2026-08-15',
          name: 'Duplicate Day',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('should reject non-existent calendar dates', async () => {
      await expect(
        service.addKitchenHoliday({
          date: '2026-02-30',
          name: 'Invalid Feb 30',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject empty holiday name', async () => {
      await expect(
        service.addKitchenHoliday({
          date: '2026-08-15',
          name: '   ',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('removeKitchenHoliday', () => {
    it('should remove holiday by CUID', async () => {
      prismaMock.kitchenHoliday.findUnique.mockResolvedValueOnce({
        id: 'h1',
        date: new Date('2026-05-01T00:00:00.000Z'),
        name: 'May Day',
      });

      const res = await service.removeKitchenHoliday('h1');
      expect(res.success).toBe(true);
      expect(prismaMock.kitchenHoliday.delete).toHaveBeenCalledWith({
        where: { id: 'h1' },
      });
    });

    it('should remove holiday by YYYY-MM-DD date', async () => {
      prismaMock.kitchenHoliday.findUnique
        .mockResolvedValueOnce(null) // ID lookup fails
        .mockResolvedValueOnce({
          id: 'h1',
          date: new Date('2026-05-01T00:00:00.000Z'),
          name: 'May Day',
        }); // Date lookup succeeds

      const res = await service.removeKitchenHoliday('2026-05-01');
      expect(res.success).toBe(true);
      expect(prismaMock.kitchenHoliday.delete).toHaveBeenCalledWith({
        where: { id: 'h1' },
      });
    });

    it('should throw NotFoundException if holiday does not exist', async () => {
      prismaMock.kitchenHoliday.findUnique.mockResolvedValue(null);

      await expect(
        service.removeKitchenHoliday('non-existent'),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
