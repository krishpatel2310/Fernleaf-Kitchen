import {
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { KitchenWorkingDayDto } from './kitchen-working-day.dto';

export class UpdateKitchenSettingsDto {
  @IsOptional()
  @IsString({ message: 'cutoffTime must be a string' })
  @Matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, {
    message: 'cutoffTime must be in HH:mm 24-hour format (e.g. 16:00)',
  })
  cutoffTime?: string;

  @IsOptional()
  @IsInt({ message: 'cutoffTimeMinutes must be an integer' })
  @Min(0, { message: 'cutoffTimeMinutes cannot be negative' })
  @Max(1439, { message: 'cutoffTimeMinutes cannot exceed 1439 (23:59)' })
  cutoffTimeMinutes?: number;

  @IsOptional()
  @IsInt({ message: 'cutoffWorkingDaysCount must be an integer' })
  @Min(1, {
    message: 'cutoffWorkingDaysCount must be a positive integer (at least 1)',
  })
  @Max(30, { message: 'cutoffWorkingDaysCount cannot exceed 30 days' })
  cutoffWorkingDaysCount?: number;

  @IsOptional()
  @IsString({ message: 'kitchenTimezone must be a string' })
  kitchenTimezone?: string;

  @IsOptional()
  @IsInt({ message: 'dispatchBufferMinutes must be an integer' })
  @Min(0, { message: 'dispatchBufferMinutes cannot be negative' })
  dispatchBufferMinutes?: number;

  @IsOptional()
  @IsInt({ message: 'defaultPackagingBufferMinutes must be an integer' })
  @Min(0, { message: 'defaultPackagingBufferMinutes cannot be negative' })
  defaultPackagingBufferMinutes?: number;

  @IsOptional()
  @IsArray({ message: 'workingDays must be an array' })
  @ValidateNested({ each: true })
  @Type(() => KitchenWorkingDayDto)
  workingDays?: KitchenWorkingDayDto[];
}
