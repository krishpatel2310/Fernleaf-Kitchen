import { Controller, Get } from '@nestjs/common';
import { Public } from '../auth/decorators/public.decorator';
import { PrismaService } from '../prisma/prisma.service';

export interface HealthResponse {
  status: 'ok' | 'degraded';
  service: string;
  timestamp: string;
  uptimeSeconds: number;
  checks: {
    process: 'ok';
    database: 'connected' | 'unreachable';
  };
}

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get()
  async check(): Promise<HealthResponse> {
    const isDbConnected = await this.prisma.isHealthy();

    return {
      status: isDbConnected ? 'ok' : 'degraded',
      service: 'fernleaf-kitchen-backend',
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
      checks: {
        process: 'ok',
        database: isDbConnected ? 'connected' : 'unreachable',
      },
    };
  }
}
