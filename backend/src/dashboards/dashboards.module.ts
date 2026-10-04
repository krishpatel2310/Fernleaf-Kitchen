import { Module } from '@nestjs/common';
import { DashboardsService } from './dashboards.service';
import { DashboardsController } from './dashboards.controller';
import { KitchenModule } from '../kitchen/kitchen.module';
import { DispatchModule } from '../dispatch/dispatch.module';
import { BillingModule } from '../billing/billing.module';
import { SettingsModule } from '../settings/settings.module';

@Module({
  imports: [KitchenModule, DispatchModule, BillingModule, SettingsModule],
  controllers: [DashboardsController],
  providers: [DashboardsService],
  exports: [DashboardsService],
})
export class DashboardsModule {}
