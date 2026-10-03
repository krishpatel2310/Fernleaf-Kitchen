import { Body, Controller, Get, Param, Patch, Post, Put } from '@nestjs/common';
import { PricingService } from './pricing.service';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { CreatePriceTierDto } from './dto/create-price-tier.dto';
import { UpdatePriceTierDto } from './dto/update-price-tier.dto';
import {
  BulkUpdateDishPricesDto,
  BulkUpdateOptionPricesDto,
} from './dto/bulk-prices.dto';

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

  @Get('tiers/:id/missing-prices')
  @RequirePermissions('pricing.read')
  async getMissingPricesForTier(@Param('id') id: string) {
    return this.pricingService.getMissingPricesForTier(id);
  }

  @Post('tiers')
  @RequirePermissions('pricing.manage')
  async createTier(@Body() dto: CreatePriceTierDto) {
    return this.pricingService.createTier(dto);
  }

  @Patch('tiers/:id')
  @RequirePermissions('pricing.manage')
  async updateTier(@Param('id') id: string, @Body() dto: UpdatePriceTierDto) {
    return this.pricingService.updateTier(id, dto);
  }

  @Post('tiers/:id/set-default')
  @RequirePermissions('pricing.manage')
  async setDefaultTier(@Param('id') id: string) {
    return this.pricingService.setDefaultTier(id);
  }

  @Put('tiers/:id/dishes')
  @RequirePermissions('pricing.manage')
  async bulkUpdateDishPrices(
    @Param('id') id: string,
    @Body() dto: BulkUpdateDishPricesDto,
  ) {
    return this.pricingService.bulkUpdateDishPrices(id, dto);
  }

  @Put('tiers/:id/options')
  @RequirePermissions('pricing.manage')
  async bulkUpdateOptionPrices(
    @Param('id') id: string,
    @Body() dto: BulkUpdateOptionPricesDto,
  ) {
    return this.pricingService.bulkUpdateOptionPrices(id, dto);
  }
}
