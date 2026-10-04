import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { SettingsService } from './settings.service';
import { CutoffService } from '../orders/cutoff.service';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { UpdateKitchenSettingsDto } from './dto/update-kitchen-settings.dto';
import { CreateKitchenHolidayDto } from './dto/kitchen-holiday.dto';

@Controller('settings')
export class SettingsController {
  constructor(
    private readonly settingsService: SettingsService,
    private readonly cutoffService: CutoffService,
  ) {}

  @Get()
  @RequirePermissions('settings.read')
  async getRootSettings() {
    return this.settingsService.getKitchenSettings();
  }

  @Get('kitchen')
  @RequirePermissions('settings.read')
  async getKitchenSettings() {
    return this.settingsService.getKitchenSettings();
  }

  @Get('kitchen/cutoff-preview')
  @RequirePermissions('settings.read')
  async getCutoffPreview(
    @Query('deliveryDate') deliveryDate?: string,
    @Query('date') date?: string,
  ) {
    const targetDate = deliveryDate || date || new Date();
    return this.cutoffService.calculateOrderCutoff(targetDate);
  }

  @Patch('kitchen')
  @RequirePermissions('settings.manage')
  async patchKitchenSettings(@Body() dto: UpdateKitchenSettingsDto) {
    return this.settingsService.updateKitchenSettings(dto);
  }

  @Put('kitchen')
  @RequirePermissions('settings.manage')
  async putKitchenSettings(@Body() dto: UpdateKitchenSettingsDto) {
    return this.settingsService.updateKitchenSettings(dto);
  }

  @Get('kitchen/working-days')
  @RequirePermissions('settings.read')
  async getKitchenWorkingDays() {
    return this.settingsService.getKitchenWorkingDays();
  }

  @Put('kitchen/working-days')
  @RequirePermissions('settings.manage')
  async updateKitchenWorkingDaysPut(@Body() body: any) {
    return this.settingsService.updateKitchenWorkingDays(body);
  }

  @Patch('kitchen/working-days')
  @RequirePermissions('settings.manage')
  async updateKitchenWorkingDaysPatch(@Body() body: any) {
    return this.settingsService.updateKitchenWorkingDays(body);
  }

  @Get('kitchen/holidays')
  @RequirePermissions('settings.read')
  async getKitchenHolidays() {
    return this.settingsService.getKitchenHolidays();
  }

  @Post('kitchen/holidays')
  @RequirePermissions('settings.manage')
  async addKitchenHoliday(@Body() dto: CreateKitchenHolidayDto) {
    return this.settingsService.addKitchenHoliday(dto);
  }

  @Delete('kitchen/holidays/:id')
  @RequirePermissions('settings.manage')
  async removeKitchenHoliday(@Param('id') id: string) {
    return this.settingsService.removeKitchenHoliday(id);
  }
}
