import { Test, TestingModule } from '@nestjs/testing';
import { HealthController } from './health.controller';
import { PrismaService } from '../prisma/prisma.service';

describe('HealthController', () => {
  let controller: HealthController;
  let mockPrismaService: { isHealthy: jest.Mock };

  beforeEach(async () => {
    mockPrismaService = {
      isHealthy: jest.fn().mockResolvedValue(true),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    controller = module.get<HealthController>(HealthController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should return ok when database is reachable', async () => {
    mockPrismaService.isHealthy.mockResolvedValue(true);

    const result = await controller.check();
    expect(result.status).toBe('ok');
    expect(result.service).toBe('fernleaf-kitchen-backend');
    expect(result.timestamp).toBeDefined();
    expect(typeof result.uptimeSeconds).toBe('number');
    expect(result.checks).toEqual({
      process: 'ok',
      database: 'connected',
    });
  });

  it('should return degraded when database is unreachable', async () => {
    mockPrismaService.isHealthy.mockResolvedValue(false);

    const result = await controller.check();
    expect(result.status).toBe('degraded');
    expect(result.service).toBe('fernleaf-kitchen-backend');
    expect(result.timestamp).toBeDefined();
    expect(typeof result.uptimeSeconds).toBe('number');
    expect(result.checks).toEqual({
      process: 'ok',
      database: 'unreachable',
    });
  });
});
