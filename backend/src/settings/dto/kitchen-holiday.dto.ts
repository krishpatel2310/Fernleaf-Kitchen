import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateKitchenHolidayDto {
  @IsString({ message: 'date must be a string' })
  @IsNotEmpty({ message: 'date is required (format: YYYY-MM-DD)' })
  date: string; // YYYY-MM-DD

  @IsString({ message: 'name must be a string' })
  @IsNotEmpty({ message: 'name is required' })
  name: string;
}

export class UpdateKitchenHolidayDto {
  @IsOptional()
  @IsString()
  date?: string;

  @IsOptional()
  @IsString()
  name?: string;
}
