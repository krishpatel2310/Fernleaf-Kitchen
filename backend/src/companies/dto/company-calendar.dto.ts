import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';
import { DayOfWeek } from '@prisma/client';

export class UpdateCompanyWorkingDayDto {
  @IsEnum(DayOfWeek)
  dayOfWeek: DayOfWeek;

  @IsBoolean()
  isWorking: boolean;
}

export class CreateCompanyHolidayDto {
  @IsDateString()
  date: string; // ISO date string (YYYY-MM-DD)

  @IsString()
  @IsNotEmpty()
  name: string;
}

export class UpdateCompanyHolidayDto {
  @IsDateString()
  @IsOptional()
  date?: string;

  @IsString()
  @IsOptional()
  name?: string;
}
