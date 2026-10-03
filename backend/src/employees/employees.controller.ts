import { Controller, Get, Param, Query } from '@nestjs/common';
import { EmployeesService } from './employees.service';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';

@Controller('employees')
export class EmployeesController {
  constructor(private readonly employeesService: EmployeesService) {}

  @Get()
  @RequirePermissions('employees.read')
  async findAll(@Query('companyId') companyId?: string) {
    return this.employeesService.findAll(companyId);
  }

  @Get(':id')
  @RequirePermissions('employees.read')
  async findOne(@Param('id') id: string) {
    return this.employeesService.findOne(id);
  }
}
