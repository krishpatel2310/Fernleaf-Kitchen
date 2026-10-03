import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Request, Response } from 'express';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const ctx = context.switchToHttp();
    const request = ctx.getRequest<Request>();
    const response = ctx.getResponse<Response>();

    const { method, originalUrl, ip } = request;
    const userAgent = request.get('user-agent') || '';
    const now = Date.now();

    return next.handle().pipe(
      tap({
        next: () => {
          const { statusCode } = response;
          const duration = Date.now() - now;
          this.logger.log(
            `${method} ${originalUrl} ${statusCode} - ${duration}ms [${ip}] ${userAgent}`,
          );
        },
        error: (error) => {
          const duration = Date.now() - now;
          const status = error.status || 500;
          this.logger.warn(
            `${method} ${originalUrl} ${status} - ${duration}ms [${ip}]: ${error.message}`,
          );
        },
      }),
    );
  }
}
