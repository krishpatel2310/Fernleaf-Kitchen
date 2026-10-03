import { Controller, Get, Param } from '@nestjs/common';
import { PricingService } from './pricing.service';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';

@Controller('pricing')
export class PricingController {
  constructor(private readonly pricingService: PricingService) {}

  @Get('tiers')
  @RequirePermissions('pricing.read')
  async findAllTiers() {
    return this.pricingService.findAllTiers();
  }

  @Get('tiers/:id')
  @RequirePermissions('pricing.read')
  async findOneTier(@Param('id') id: string) {
    return this.pricingService.findOneTier(id);
  }
}
