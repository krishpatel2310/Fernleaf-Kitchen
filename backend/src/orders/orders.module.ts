import { Module } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';
import { CutoffService } from './cutoff.service';
import { PricingModule } from '../pricing/pricing.module';
import { MenuModule } from '../menu/menu.module';
import { CompaniesModule } from '../companies/companies.module';
import { KitchenModule } from '../kitchen/kitchen.module';
import { DispatchModule } from '../dispatch/dispatch.module';

@Module({
  imports: [
    PricingModule,
    MenuModule,
    CompaniesModule,
    KitchenModule,
    DispatchModule,
  ],
  controllers: [OrdersController],
  providers: [OrdersService, CutoffService],
  exports: [OrdersService, CutoffService],
})
export class OrdersModule {}
