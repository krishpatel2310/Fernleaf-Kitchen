import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { MenuService } from './menu.service';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import {
  CreateMenuCategoryDto,
  UpdateMenuCategoryDto,
} from './dto/menu-category.dto';
import {
  AddCategoryDishDto,
  MenuPreviewQueryDto,
  ReorderCategoriesDto,
  ReorderCategoryDishesDto,
  SetCompanyVisibilityDto,
} from './dto/menu-items.dto';

@Controller('menu')
export class MenuController {
  constructor(private readonly menuService: MenuService) {}

  // ===========================================================================
  // CATEGORIES
  // ===========================================================================

  @Get('categories')
  @RequirePermissions('menu.read')
  async findAllCategories(
    @Query('includeSecret') includeSecret?: string,
    @Query('includeInactive') includeInactive?: string,
  ) {
    return this.menuService.findAllCategories(
      includeSecret === 'true',
      includeInactive === 'true',
    );
  }

  @Get('categories/:id')
  @RequirePermissions('menu.read')
  async findCategoryById(@Param('id') id: string) {
    return this.menuService.findCategoryById(id);
  }

  @Post('categories')
  @RequirePermissions('menu.manage')
  async createCategory(@Body() dto: CreateMenuCategoryDto) {
    return this.menuService.createCategory(dto);
  }

  @Patch('categories/:id')
  @RequirePermissions('menu.manage')
  async updateCategory(
    @Param('id') id: string,
    @Body() dto: UpdateMenuCategoryDto,
  ) {
    return this.menuService.updateCategory(id, dto);
  }

  @Post('categories/reorder')
  @RequirePermissions('menu.manage')
  async reorderCategories(@Body() dto: ReorderCategoriesDto) {
    return this.menuService.reorderCategories(dto);
  }

  // ===========================================================================
  // CATEGORY DISHES
  // ===========================================================================

  @Post('categories/:id/dishes')
  @RequirePermissions('menu.manage')
  async addDishToCategory(
    @Param('id') categoryId: string,
    @Body() dto: AddCategoryDishDto,
  ) {
    return this.menuService.addDishToCategory(categoryId, dto);
  }

  @Delete('categories/:id/dishes/:dishId')
  @RequirePermissions('menu.manage')
  async removeDishFromCategory(
    @Param('id') categoryId: string,
    @Param('dishId') dishId: string,
  ) {
    return this.menuService.removeDishFromCategory(categoryId, dishId);
  }

  @Post('categories/:id/dishes/reorder')
  @RequirePermissions('menu.manage')
  async reorderDishesInCategory(
    @Param('id') categoryId: string,
    @Body() dto: ReorderCategoryDishesDto,
  ) {
    return this.menuService.reorderDishesInCategory(categoryId, dto);
  }

  @Patch('categories/:id/dishes/:dishId/toggle')
  @RequirePermissions('menu.manage')
  async toggleMenuItemActive(
    @Param('id') categoryId: string,
    @Param('dishId') dishId: string,
    @Body('isActive') isActive: boolean,
  ) {
    return this.menuService.toggleMenuItemActive(categoryId, dishId, isActive);
  }

  // ===========================================================================
  // COMPANY VISIBILITY
  // ===========================================================================

  @Get('company-visibility/:companyId')
  @RequirePermissions('menu.read')
  async getCompanyVisibility(@Param('companyId') companyId: string) {
    return this.menuService.getCompanyVisibility(companyId);
  }

  @Post('company-visibility/:companyId/category/:categoryId')
  @RequirePermissions('menu.manage')
  async setCompanyHiddenCategory(
    @Param('companyId') companyId: string,
    @Param('categoryId') categoryId: string,
    @Body() dto: SetCompanyVisibilityDto,
  ) {
    return this.menuService.setCompanyHiddenCategory(
      companyId,
      categoryId,
      dto.hide,
    );
  }

  @Post('company-visibility/:companyId/dish/:dishId')
  @RequirePermissions('menu.manage')
  async setCompanyHiddenDish(
    @Param('companyId') companyId: string,
    @Param('dishId') dishId: string,
    @Body() dto: SetCompanyVisibilityDto,
  ) {
    return this.menuService.setCompanyHiddenDish(companyId, dishId, dto.hide);
  }

  // ===========================================================================
  // MENU PREVIEW
  // ===========================================================================

  @Get('preview')
  @RequirePermissions('menu.read')
  async getMenuPreview(@Query() query: MenuPreviewQueryDto) {
    return this.menuService.getMenuPreview(query);
  }
}
