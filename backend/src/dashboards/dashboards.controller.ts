import { Controller, Get, Query } from '@nestjs/common';
import { DashboardsService } from './dashboards.service';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';

@Controller('dashboards')
export class DashboardsController {
  constructor(private readonly dashboardsService: DashboardsService) {}

  @Get('admin')
  @RequirePermissions('dashboards.admin')
  async getAdminSummary() {
    return this.dashboardsService.getAdminSummary();
  }

  @Get('kitchen')
  @RequirePermissions('kitchen.read')
  async getKitchenSummary(@Query('date') date?: string) {
    return this.dashboardsService.getKitchenSummary(date);
  }

  @Get('dispatch')
  @RequirePermissions('dispatch.read')
  async getDispatchSummary(@Query('date') date?: string) {
    return this.dashboardsService.getDispatchSummary(date);
  }
}
