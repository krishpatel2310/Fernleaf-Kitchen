import { Controller, Get, Param, Query } from '@nestjs/common';
import { DispatchService } from './dispatch.service';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import {
  CurrentUser,
  AuthenticatedUser,
} from '../auth/decorators/current-user.decorator';

@Controller('dispatch')
export class DispatchController {
  constructor(private readonly dispatchService: DispatchService) {}

  @Get('drops')
  @RequirePermissions('dispatch.read')
  async findAllDrops(@Query('date') date?: string) {
    return this.dispatchService.findAllDrops(date);
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
  @RequirePermissions('dispatch.read')
  async findOneDrop(@Param('id') id: string) {
    return this.dispatchService.findOneDrop(id);
  }
}
