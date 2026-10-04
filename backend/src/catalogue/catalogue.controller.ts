import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { CatalogueService, ReferenceDataType } from './catalogue.service';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { CreateDishDto } from './dto/create-dish.dto';
import { UpdateDishDto } from './dto/update-dish.dto';
import {
  QueryDishDto,
  QueryOptionDto,
  QueryOptionGroupDto,
} from './dto/query-catalogue.dto';
import { CreateOptionDto, UpdateOptionDto } from './dto/create-option.dto';
import {
  CreateOptionGroupDto,
  UpdateOptionGroupDto,
} from './dto/create-option-group.dto';
import {
  CreateReferenceDataDto,
  UpdateReferenceDataDto,
} from './dto/reference-data.dto';

@Controller('catalogue')
export class CatalogueController {
  constructor(private readonly catalogueService: CatalogueService) {}

  // ===========================================================================
  // REFERENCE DATA
  // ===========================================================================

  @Get('reference-data')
  @RequirePermissions('catalogue.read')
  async getReferenceData() {
    return this.catalogueService.getReferenceData();
  }

  @Get('reference-data/:type')
  @RequirePermissions('catalogue.read')
  async getReferenceDataList(
    @Param('type') type: ReferenceDataType,
    @Query('includeInactive') includeInactive?: string,
  ) {
    return this.catalogueService.getReferenceDataList(
      type,
      includeInactive === 'true',
    );
  }

  @Get('stations')
  @RequirePermissions('catalogue.read')
  async getStations(@Query('includeInactive') includeInactive?: string) {
    return this.catalogueService.getReferenceDataList(
      'kitchen-stations',
      includeInactive === 'true',
    );
  }

  @Get('allergens')
  @RequirePermissions('catalogue.read')
  async getAllergens(@Query('includeInactive') includeInactive?: string) {
    return this.catalogueService.getReferenceDataList(
      'allergens',
      includeInactive === 'true',
    );
  }

  @Get('dietary-tags')
  @RequirePermissions('catalogue.read')
  async getDietaryTags(@Query('includeInactive') includeInactive?: string) {
    return this.catalogueService.getReferenceDataList(
      'dietary-tags',
      includeInactive === 'true',
    );
  }

  @Get('packaging-types')
  @RequirePermissions('catalogue.read')
  async getPackagingTypes(@Query('includeInactive') includeInactive?: string) {
    return this.catalogueService.getReferenceDataList(
      'packaging-types',
      includeInactive === 'true',
    );
  }

  @Get('portion-sizes')
  @RequirePermissions('catalogue.read')
  async getPortionSizes(@Query('includeInactive') includeInactive?: string) {
    return this.catalogueService.getReferenceDataList(
      'portion-sizes',
      includeInactive === 'true',
    );
  }

  @Post('reference-data/:type')
  @RequirePermissions('catalogue.manage')
  async createReferenceData(
    @Param('type') type: ReferenceDataType,
    @Body() dto: CreateReferenceDataDto,
  ) {
    return this.catalogueService.createReferenceData(type, dto);
  }

  @Patch('reference-data/:type/:id')
  @RequirePermissions('catalogue.manage')
  async updateReferenceData(
    @Param('type') type: ReferenceDataType,
    @Param('id') id: string,
    @Body() dto: UpdateReferenceDataDto,
  ) {
    return this.catalogueService.updateReferenceData(type, id, dto);
  }

  // ===========================================================================
  // DISHES
  // ===========================================================================

  @Get('dishes')
  @RequirePermissions('catalogue.read')
  async findAllDishes(@Query() query: QueryDishDto) {
    return this.catalogueService.findAllDishes(query);
  }

  @Get('dishes/:id')
  @RequirePermissions('catalogue.read')
  async findOneDish(@Param('id') id: string) {
    return this.catalogueService.findOneDish(id);
  }

  @Post('dishes')
  @RequirePermissions('catalogue.manage')
  async createDish(@Body() dto: CreateDishDto) {
    return this.catalogueService.createDish(dto);
  }

  @Patch('dishes/:id')
  @RequirePermissions('catalogue.manage')
  async updateDish(@Param('id') id: string, @Body() dto: UpdateDishDto) {
    return this.catalogueService.updateDish(id, dto);
  }

  @Post('dishes/:id/activate')
  @RequirePermissions('catalogue.manage')
  async activateDish(@Param('id') id: string) {
    return this.catalogueService.setDishActive(id, true);
  }

  @Post('dishes/:id/deactivate')
  @RequirePermissions('catalogue.manage')
  async deactivateDish(@Param('id') id: string) {
    return this.catalogueService.setDishActive(id, false);
  }

  // ===========================================================================
  // OPTIONS
  // ===========================================================================

  @Get('options')
  @RequirePermissions('catalogue.read')
  async findAllOptions(@Query() query: QueryOptionDto) {
    return this.catalogueService.findAllOptions(query);
  }

  @Get('options/:id')
  @RequirePermissions('catalogue.read')
  async findOneOption(@Param('id') id: string) {
    return this.catalogueService.findOneOption(id);
  }

  @Post('options')
  @RequirePermissions('catalogue.manage')
  async createOption(@Body() dto: CreateOptionDto) {
    return this.catalogueService.createOption(dto);
  }

  @Patch('options/:id')
  @RequirePermissions('catalogue.manage')
  async updateOption(@Param('id') id: string, @Body() dto: UpdateOptionDto) {
    return this.catalogueService.updateOption(id, dto);
  }

  @Post('options/:id/activate')
  @RequirePermissions('catalogue.manage')
  async activateOption(@Param('id') id: string) {
    return this.catalogueService.setOptionActive(id, true);
  }

  @Post('options/:id/deactivate')
  @RequirePermissions('catalogue.manage')
  async deactivateOption(@Param('id') id: string) {
    return this.catalogueService.setOptionActive(id, false);
  }

  // ===========================================================================
  // OPTION GROUPS
  // ===========================================================================

  @Get('option-groups')
  @RequirePermissions('catalogue.read')
  async findAllOptionGroups(@Query() query: QueryOptionGroupDto) {
    return this.catalogueService.findAllOptionGroups(query);
  }

  @Get('option-groups/:id')
  @RequirePermissions('catalogue.read')
  async findOneOptionGroup(@Param('id') id: string) {
    return this.catalogueService.findOneOptionGroup(id);
  }

  @Post('option-groups')
  @RequirePermissions('catalogue.manage')
  async createOptionGroup(@Body() dto: CreateOptionGroupDto) {
    return this.catalogueService.createOptionGroup(dto);
  }

  @Patch('option-groups/:id')
  @RequirePermissions('catalogue.manage')
  async updateOptionGroup(
    @Param('id') id: string,
    @Body() dto: UpdateOptionGroupDto,
  ) {
    return this.catalogueService.updateOptionGroup(id, dto);
  }

  @Post('option-groups/:id/activate')
  @RequirePermissions('catalogue.manage')
  async activateOptionGroup(@Param('id') id: string) {
    return this.catalogueService.setOptionGroupActive(id, true);
  }

  @Post('option-groups/:id/deactivate')
  @RequirePermissions('catalogue.manage')
  async deactivateOptionGroup(@Param('id') id: string) {
    return this.catalogueService.setOptionGroupActive(id, false);
  }
}
