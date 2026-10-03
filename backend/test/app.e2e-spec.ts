import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { HealthController } from '../src/health/health.controller';

describe('AppController (e2e)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  it('should be defined', () => {
    expect(app).toBeDefined();
  });

  it('should resolve health controller and distinguish process from database status', async () => {
    const healthController = app.get(HealthController);
    const health = await healthController.check();
    expect(health).toBeDefined();
    expect(health.service).toBe('fernleaf-kitchen-backend');
    expect(health.checks.process).toBe('ok');
    expect(['connected', 'unreachable']).toContain(health.checks.database);
    expect(['ok', 'degraded']).toContain(health.status);
  });
});
