import { Test, TestingModule } from '@nestjs/testing';
import { PricingService } from './pricing.service';
import { PrismaService } from '../prisma/prisma.service';

describe('PricingService', () => {
  let service: PricingService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PricingService,
        {
          provide: PrismaService,
          useValue: {},
        },
      ],
    }).compile();

    service = module.get<PricingService>(PricingService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('roundUpToNextFiveCents', () => {
    it('should round 211 cents ($2.11) up to 215 cents ($2.15)', () => {
      expect(service.roundUpToNextFiveCents(211)).toBe(215);
    });

    it('should round 212 cents up to 215 cents', () => {
      expect(service.roundUpToNextFiveCents(212)).toBe(215);
    });

    it('should round 215 cents to 215 cents (exact multiple)', () => {
      expect(service.roundUpToNextFiveCents(215)).toBe(215);
    });

    it('should round 216 cents up to 220 cents', () => {
      expect(service.roundUpToNextFiveCents(216)).toBe(220);
    });

    it('should round 1 cent up to 5 cents', () => {
      expect(service.roundUpToNextFiveCents(1)).toBe(5);
    });

    it('should leave 0 cents as 0 cents', () => {
      expect(service.roundUpToNextFiveCents(0)).toBe(0);
    });
  });
});
