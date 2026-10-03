import { Controller, Get, Param, Query } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { OrderStatus } from '@prisma/client';

@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get()
  @RequirePermissions('orders.read')
  async findAll(
    @Query('status') status?: OrderStatus,
    @Query('companyId') companyId?: string,
    @Query('deliveryDate') deliveryDate?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.ordersService.findAll({
      status,
      companyId,
      deliveryDate,
      page,
      limit,
    });
  }

  @Get(':id')
  @RequirePermissions('orders.read')
  async findOne(@Param('id') id: string) {
    return this.ordersService.findOne(id);
  }
}
