import { Controller, Get, Query } from '@nestjs/common';
import { DashboardsService } from './dashboards.service';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';

@Controller('dashboards')
export class DashboardsController {
  constructor(private readonly dashboardsService: DashboardsService) {}

  @Get('admin')
  @RequirePermissions('dashboard.admin')
  async getAdminSummary() {
    return this.dashboardsService.getAdminSummary();
  }

  @Get('kitchen')
  @RequirePermissions('dashboard.kitchen')
  async getKitchenSummary(@Query('date') date?: string) {
    return this.dashboardsService.getKitchenSummary(date);
  }

  @Get('dispatch')
  @RequirePermissions('dashboard.dispatch')
  async getDispatchSummary(@Query('date') date?: string) {
    return this.dashboardsService.getDispatchSummary(date);
  }
}
