import { Controller, Get, Param } from '@nestjs/common';
import { CompaniesService } from './companies.service';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';

@Controller('companies')
export class CompaniesController {
  constructor(private readonly companiesService: CompaniesService) {}

  @Get()
  @RequirePermissions('companies.read')
  async findAll() {
    return this.companiesService.findAll();
  }

  @Get(':id')
  @RequirePermissions('companies.read')
  async findOne(@Param('id') id: string) {
    return this.companiesService.findOne(id);
  }
}
