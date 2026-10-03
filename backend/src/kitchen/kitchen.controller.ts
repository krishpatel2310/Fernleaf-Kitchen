import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { KitchenService } from './kitchen.service';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import {
  CurrentUser,
  AuthenticatedUser,
} from '../auth/decorators/current-user.decorator';

@Controller('kitchen')
export class KitchenController {
  constructor(private readonly kitchenService: KitchenService) {}

  /**
   * Returns active kitchen stations for filtering.
   */
  @Get('stations')
  @RequirePermissions('kitchen.read')
  async getStations() {
    return this.kitchenService.getStations();
  }

  /**
   * Kitchen production board:
   * Returns confirmed kitchen units for a given delivery date (defaults to today in Asia/Kolkata).
   * Optional station filtering (stationId or 'unassigned').
   */
  @Get('board')
  @RequirePermissions('kitchen.read')
  async getBoard(
    @Query('date') date?: string,
    @Query('stationId') stationId?: string,
  ) {
    return this.kitchenService.getBoard(date, stationId);
  }

  /**
   * Retrieves single kitchen unit details.
   */
  @Get('units/:id')
  @RequirePermissions('kitchen.read')
  async findOneUnit(@Param('id') id: string) {
    return this.kitchenService.findOneUnit(id);
  }

  /**
   * Starts preparation for a kitchen unit (NOT_STARTED -> IN_PROGRESS).
   */
  @Post('units/:id/start')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('kitchen.start')
  async startUnit(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.kitchenService.startUnit(id, user?.id);
  }

  /**
   * Finishes preparation for a kitchen unit (IN_PROGRESS/NOT_STARTED -> DONE).
   * Supports finish-without-start.
   */
  @Post('units/:id/finish')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('kitchen.finish')
  async finishUnit(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.kitchenService.finishUnit(id, user?.id);
  }

  /**
   * Admin force-complete: completes all remaining kitchen units on a confirmed order.
   */
  @Post('orders/:id/force-complete')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('kitchen.force_complete')
  async forceCompleteOrder(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.kitchenService.forceCompleteOrder(id, user?.id);
  }
}
