import { Controller, Get, Query } from '@nestjs/common';
import { DashboardsService } from './dashboards.service';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import { DashboardDateQueryDto } from './dto/dashboard-query.dto';

@Controller('dashboards')
export class DashboardsController {
  constructor(private readonly dashboardsService: DashboardsService) {}

  @Get('admin')
  @RequirePermissions('dashboard.admin')
  async getAdminDashboard(@Query() query: DashboardDateQueryDto) {
    return this.dashboardsService.getAdminDashboard(query?.date);
  }

  @Get('kitchen')
  @RequirePermissions('dashboard.kitchen')
  async getKitchenDashboard(@Query() query: DashboardDateQueryDto) {
    return this.dashboardsService.getKitchenDashboard(query?.date);
  }

  @Get('dispatch')
  @RequirePermissions('dashboard.dispatch')
  async getDispatchDashboard(@Query() query: DashboardDateQueryDto) {
    return this.dashboardsService.getDispatchDashboard(query?.date);
  }

  @Get('driver')
  @RequirePermissions('dashboard.driver')
  async getDriverDashboard(@CurrentUser() user: AuthenticatedUser) {
    return this.dashboardsService.getDriverDashboard(user.id);
  }
}
