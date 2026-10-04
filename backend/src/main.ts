import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule, {
    logger:
      process.env.NODE_ENV === 'production'
        ? ['error', 'warn', 'log']
        : ['error', 'warn', 'log', 'debug', 'verbose'],
  });

  const configService = app.get(ConfigService);
  const port = configService.get<number>('port') || 4000;
  const frontendUrl =
    configService.get<string>('frontendUrl') || 'http://localhost:3000';
  const kitchenTimezone =
    configService.get<string>('kitchenTimezone') || 'Asia/Kolkata';

  // API prefix
  app.setGlobalPrefix('api');

  // Global DTO Validation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // CORS configuration
  app.enableCors({
    origin: (origin, callback) => {
      // Allow requests with no origin (e.g. mobile apps, curl, server-to-server)
      if (!origin) return callback(null, true);
      // Allow configured frontend URL, local development ports, or cloud previews
      if (
        frontendUrl === '*' ||
        origin === frontendUrl ||
        origin === 'http://localhost:3000' ||
        origin === 'http://127.0.0.1:3000' ||
        origin.endsWith('.vercel.app') ||
        origin.endsWith('.onrender.com') ||
        origin.endsWith('.railway.app')
      ) {
        return callback(null, true);
      }
      return callback(null, true);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
  });

  await app.listen(port);

  logger.log(`=======================================================`);
  logger.log(`Fernleaf Kitchen Operations Admin Panel - Backend API`);
  logger.log(`Port:              ${port}`);
  logger.log(`API URL:           http://localhost:${port}/api`);
  logger.log(`Health Check:      http://localhost:${port}/api/health`);
  logger.log(`Kitchen Timezone:  ${kitchenTimezone}`);
  logger.log(`Frontend Origin:   ${frontendUrl}`);
  logger.log(`Environment:       ${process.env.NODE_ENV || 'development'}`);
  logger.log(`=======================================================`);
}

bootstrap();
