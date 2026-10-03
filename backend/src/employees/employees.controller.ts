import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { EmployeesService } from './employees.service';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { TransferEmployeeDto } from './dto/transfer-employee.dto';
import { QueryEmployeeDto } from './dto/query-employee.dto';

@Controller('employees')
export class EmployeesController {
  constructor(private readonly employeesService: EmployeesService) {}

  @Get()
  @RequirePermissions('employees.read')
  async findAll(@Query() query: QueryEmployeeDto) {
    return this.employeesService.findAll(query);
  }

  @Get(':id')
  @RequirePermissions('employees.read')
  async findOne(@Param('id') id: string) {
    return this.employeesService.findOne(id);
  }

  @Post()
  @RequirePermissions('employees.manage')
  async create(@Body() dto: CreateEmployeeDto) {
    return this.employeesService.create(dto);
  }

  @Patch(':id')
  @RequirePermissions('employees.manage')
  async update(@Param('id') id: string, @Body() dto: UpdateEmployeeDto) {
    return this.employeesService.update(id, dto);
  }

  @Post(':id/transfer')
  @RequirePermissions('employees.manage')
  async transfer(@Param('id') id: string, @Body() dto: TransferEmployeeDto) {
    return this.employeesService.transferCompany(id, dto);
  }

  @Post(':id/activate')
  @RequirePermissions('employees.manage')
  async activate(@Param('id') id: string) {
    return this.employeesService.setEmployeeActive(id, true);
  }

  @Post(':id/deactivate')
  @RequirePermissions('employees.manage')
  async deactivate(@Param('id') id: string) {
    return this.employeesService.setEmployeeActive(id, false);
  }
}
