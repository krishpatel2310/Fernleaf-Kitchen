import { Controller, Get } from '@nestjs/common';
import { SettingsService } from './settings.service';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';

@Controller('settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get('kitchen')
  @RequirePermissions('settings.read')
  async getKitchenSettings() {
    return this.settingsService.getKitchenSettings();
  }

  @Get('kitchen/working-days')
  @RequirePermissions('settings.read')
  async getKitchenWorkingDays() {
    return this.settingsService.getKitchenWorkingDays();
  }

  @Get('kitchen/holidays')
  @RequirePermissions('settings.read')
  async getKitchenHolidays() {
    return this.settingsService.getKitchenHolidays();
  }
}
