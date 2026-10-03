import { Controller, Get, Param, Query } from '@nestjs/common';
import { KitchenService } from './kitchen.service';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';

@Controller('kitchen')
export class KitchenController {
  constructor(private readonly kitchenService: KitchenService) {}

  @Get('board')
  @RequirePermissions('kitchen.read')
  async getBoard(
    @Query('date') date: string,
    @Query('stationId') stationId?: string,
  ) {
    const targetDate = date || new Date().toISOString().split('T')[0];
    return this.kitchenService.getBoard(targetDate, stationId);
  }

  @Get('units/:id')
  @RequirePermissions('kitchen.read')
  async findOneUnit(@Param('id') id: string) {
    return this.kitchenService.findOneUnit(id);
  }
}
