export interface AppConfig {
  port: number;
  environment: string;
  databaseUrl: string;
  kitchenTimezone: string;
  jwtSecret: string;
  jwtExpiresIn: string;
  frontendUrl: string;
}

export const configuration = (): AppConfig => ({
  port: parseInt(process.env.PORT || '4000', 10),
  environment: process.env.NODE_ENV || 'development',
  databaseUrl: process.env.DATABASE_URL || '',
  kitchenTimezone: process.env.KITCHEN_TIMEZONE || 'Asia/Kolkata',
  jwtSecret:
    process.env.JWT_SECRET ||
    'fernleaf-dev-secret-key-change-in-production-min32chars',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',
});
