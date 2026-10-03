import { Controller, Get, Param } from '@nestjs/common';
import { MenuService } from './menu.service';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';

@Controller('menu')
export class MenuController {
  constructor(private readonly menuService: MenuService) {}

  @Get('categories')
  @RequirePermissions('menu.read')
  async findAllCategories() {
    return this.menuService.findAllCategories();
  }

  @Get('categories/:id')
  @RequirePermissions('menu.read')
  async findCategoryById(@Param('id') id: string) {
    return this.menuService.findCategoryById(id);
  }
}
