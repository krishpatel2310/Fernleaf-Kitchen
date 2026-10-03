import { IsOptional, IsString } from 'class-validator';

export class CancelOrderDto {
  @IsString()
  @IsOptional()
  reason?: string;
}
