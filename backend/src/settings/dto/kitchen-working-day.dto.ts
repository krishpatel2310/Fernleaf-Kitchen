import { IsBoolean, IsEnum } from 'class-validator';
import { DayOfWeek } from '@prisma/client';

export class KitchenWorkingDayDto {
  @IsEnum(DayOfWeek, {
    message:
      'dayOfWeek must be one of: MONDAY, TUESDAY, WEDNESDAY, THURSDAY, FRIDAY, SATURDAY, SUNDAY',
  })
  dayOfWeek: DayOfWeek;

  @IsBoolean({ message: 'isWorking must be a boolean' })
  isWorking: boolean;
}

export class UpdateKitchenWorkingDaysDto {
  workingDays?: KitchenWorkingDayDto[];
}
