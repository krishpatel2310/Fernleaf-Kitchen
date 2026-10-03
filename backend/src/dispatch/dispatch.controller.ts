import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Body,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { DispatchService } from './dispatch.service';
import {
  RequirePermissions,
  RequireAnyPermission,
} from '../auth/decorators/require-permissions.decorator';
import {
  CurrentUser,
  AuthenticatedUser,
} from '../auth/decorators/current-user.decorator';
import { AssignDriverDto } from './dto/assign-driver.dto';
import { MarkDeliveredDto } from './dto/mark-delivered.dto';
import { GenerateDropsDto } from './dto/generate-drops.dto';
import { DropStatus } from '@prisma/client';

@Controller('dispatch')
export class DispatchController {
  constructor(private readonly dispatchService: DispatchService) {}

  @Get('drops')
  @RequirePermissions('dispatch.read')
  async findAllDrops(
    @Query('date') date?: string,
    @Query('status') status?: DropStatus,
  ) {
    return this.dispatchService.findAllDrops(date, status);
  }

  @Post('drops/generate')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('dispatch.read')
  async generateDrops(@Body() dto: GenerateDropsDto) {
    return this.dispatchService.generateDropsForDate(dto.date);
  }

  @Get('my-deliveries')
  @RequirePermissions('driver.read_own_deliveries')
  async findDriverDeliveries(
    @CurrentUser() user: AuthenticatedUser,
    @Query('date') date?: string,
  ) {
    return this.dispatchService.findDriverDrops(user.id, date);
  }

  @Get('drops/:id')
  @RequireAnyPermission('dispatch.read', 'driver.read_own_deliveries')
  async findOneDrop(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.dispatchService.findOneDrop(id, user);
  }

  @Post('drops/:id/assign-driver')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('dispatch.assign_driver')
  async assignDriver(
    @Param('id') id: string,
    @Body() dto: AssignDriverDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.dispatchService.assignDriver(id, dto.driverId, user);
  }

  @Post('drops/:id/dispatch-ready')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('dispatch.update_status')
  async markDispatchReady(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.dispatchService.markDispatchReady(id, user);
  }

  @Post('drops/:id/out-for-delivery')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('dispatch.update_status')
  async markOutForDelivery(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.dispatchService.markOutForDelivery(id, user);
  }

  @Post('drops/:id/delivered')
  @HttpCode(HttpStatus.OK)
  @RequireAnyPermission('driver.mark_delivered', 'dispatch.update_status')
  async markDelivered(
    @Param('id') id: string,
    @Body() dto: MarkDeliveredDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.dispatchService.markDelivered(id, dto, user);
  }
}
