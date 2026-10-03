import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { OrdersService } from './orders.service';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import {
  AuthenticatedUser,
  CurrentUser,
} from '../auth/decorators/current-user.decorator';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { CancelOrderDto } from './dto/cancel-order.dto';
import { AdminOverrideDto } from './dto/admin-override.dto';
import { QueryOrderDto } from './dto/query-order.dto';

@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get()
  @RequirePermissions('orders.read')
  async findAll(@Query() query: QueryOrderDto) {
    return this.ordersService.findAll(query);
  }

  @Post('process-cutoffs')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('orders.override')
  async processCutoffs(@CurrentUser() user: AuthenticatedUser) {
    return this.ordersService.processCutoffs(new Date(), user?.id);
  }

  @Get(':id')
  @RequirePermissions('orders.read')
  async findOne(@Param('id') id: string) {
    return this.ordersService.findOne(id);
  }

  @Get(':id/timeline')
  @RequirePermissions('orders.read')
  async getTimeline(@Param('id') id: string) {
    return this.ordersService.getOrderTimeline(id);
  }

  @Post()
  @RequirePermissions('orders.create')
  async create(
    @Body() dto: CreateOrderDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.ordersService.create(dto, user?.id);
  }

  @Patch(':id')
  @RequirePermissions('orders.update')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateOrderDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.ordersService.update(id, dto, user?.id);
  }

  @Post(':id/place')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('orders.update')
  async place(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.ordersService.place(id, user?.id);
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('orders.cancel')
  async cancel(
    @Param('id') id: string,
    @Body() dto: CancelOrderDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const isAdmin =
      user?.permissions?.includes('orders.override') ||
      user?.roleName === 'ADMIN';
    return this.ordersService.cancel(id, dto, user?.id, isAdmin);
  }

  @Post(':id/override')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('orders.override')
  async adminOverride(
    @Param('id') id: string,
    @Body() dto: AdminOverrideDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.ordersService.adminOverride(id, dto, user.id);
  }
}
