import { Controller, Get, Param, Query } from '@nestjs/common';
import { CatalogueService } from './catalogue.service';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';

@Controller('catalogue')
export class CatalogueController {
  constructor(private readonly catalogueService: CatalogueService) {}

  @Get('dishes')
  @RequirePermissions('catalogue.read')
  async findAllDishes(@Query('includeInactive') includeInactive?: string) {
    return this.catalogueService.findAllDishes(includeInactive === 'true');
  }

  @Get('dishes/:id')
  @RequirePermissions('catalogue.read')
  async findOneDish(@Param('id') id: string) {
    return this.catalogueService.findOneDish(id);
  }

  @Get('options')
  @RequirePermissions('catalogue.read')
  async findAllOptions() {
    return this.catalogueService.findAllOptions();
  }

  @Get('option-groups')
  @RequirePermissions('catalogue.read')
  async findAllOptionGroups() {
    return this.catalogueService.findAllOptionGroups();
  }

  @Get('reference-data')
  @RequirePermissions('catalogue.read')
  async getReferenceData() {
    return this.catalogueService.getReferenceData();
  }
}
