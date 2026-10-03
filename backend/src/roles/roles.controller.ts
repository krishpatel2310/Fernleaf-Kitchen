import { Controller, Get, Param } from '@nestjs/common';
import { RolesService } from './roles.service';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';

@Controller('roles')
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Get()
  @RequirePermissions('roles.read')
  async findAllRoles() {
    return this.rolesService.findAllRoles();
  }

  @Get('permissions')
  @RequirePermissions('roles.read')
  async findAllPermissions() {
    return this.rolesService.findAllPermissions();
  }

  @Get(':id')
  @RequirePermissions('roles.read')
  async findOneRole(@Param('id') id: string) {
    return this.rolesService.findOneRole(id);
  }
}
