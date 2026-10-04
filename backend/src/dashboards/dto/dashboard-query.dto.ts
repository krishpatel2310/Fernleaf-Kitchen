import { IsDateString, IsOptional } from 'class-validator';

export class DashboardDateQueryDto {
  @IsOptional()
  @IsDateString(
    {},
    { message: 'date must be a valid ISO date string (YYYY-MM-DD)' },
  )
  date?: string;
}
