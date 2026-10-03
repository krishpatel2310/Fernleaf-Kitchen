import { PrismaService } from './prisma.service';

describe('PrismaService', () => {
  let service: PrismaService;
  const originalEnv = process.env.NODE_ENV;

  beforeEach(() => {
    service = new PrismaService();
  });

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
    jest.restoreAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('onModuleInit', () => {
    it('should connect successfully when database is available', async () => {
      jest.spyOn(service, '$connect').mockResolvedValueOnce();

      await expect(service.onModuleInit()).resolves.toBeUndefined();
      expect(service.$connect).toHaveBeenCalled();
    });

    it('should fail explicitly in production when connection cannot be established', async () => {
      process.env.NODE_ENV = 'production';
      jest
        .spyOn(service, '$connect')
        .mockRejectedValueOnce(new Error('Connection refused'));

      await expect(service.onModuleInit()).rejects.toThrow(
        /Fatal: Could not establish required database connection in production/,
      );
    });

    it('should log warning and not throw in development/test when connection is deferred', async () => {
      process.env.NODE_ENV = 'test';
      jest
        .spyOn(service, '$connect')
        .mockRejectedValueOnce(new Error('Connection refused'));

      await expect(service.onModuleInit()).resolves.toBeUndefined();
    });
  });

  describe('isHealthy', () => {
    it('should return true when queryRaw succeeds', async () => {
      jest.spyOn(service, '$queryRaw').mockResolvedValueOnce([1]);

      const result = await service.isHealthy();
      expect(result).toBe(true);
    });

    it('should return false when queryRaw fails', async () => {
      jest
        .spyOn(service, '$queryRaw')
        .mockRejectedValueOnce(new Error('DB unreachable'));

      const result = await service.isHealthy();
      expect(result).toBe(false);
    });
  });
});
