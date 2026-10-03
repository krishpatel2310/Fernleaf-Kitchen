import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { CompaniesService } from './companies.service';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';
import {
  CreateCompanyAddressDto,
  UpdateCompanyAddressDto,
} from './dto/company-address.dto';
import {
  CreateCompanyHolidayDto,
  UpdateCompanyWorkingDayDto,
} from './dto/company-calendar.dto';
import { QueryCompanyDto } from './dto/query-company.dto';
import { AddCompanyDomainDto } from './dto/company-domain.dto';

@Controller('companies')
export class CompaniesController {
  constructor(private readonly companiesService: CompaniesService) {}

  @Get()
  @RequirePermissions('companies.read')
  async findAll(@Query() query: QueryCompanyDto) {
    return this.companiesService.findAll(query);
  }

  @Get(':id')
  @RequirePermissions('companies.read')
  async findOne(@Param('id') id: string) {
    return this.companiesService.findOne(id);
  }

  @Post()
  @RequirePermissions('companies.manage')
  async create(@Body() dto: CreateCompanyDto) {
    return this.companiesService.create(dto);
  }

  @Patch(':id')
  @RequirePermissions('companies.manage')
  async update(@Param('id') id: string, @Body() dto: UpdateCompanyDto) {
    return this.companiesService.update(id, dto);
  }

  @Post(':id/domains')
  @RequirePermissions('companies.manage')
  async addDomain(
    @Param('id') companyId: string,
    @Body() dto: AddCompanyDomainDto,
  ) {
    return this.companiesService.addDomain(companyId, dto.domain);
  }

  @Delete(':id/domains/:domainId')
  @RequirePermissions('companies.manage')
  async removeDomain(
    @Param('id') companyId: string,
    @Param('domainId') domainId: string,
  ) {
    return this.companiesService.removeDomain(companyId, domainId);
  }

  @Post(':id/addresses')
  @RequirePermissions('companies.manage')
  async addAddress(
    @Param('id') companyId: string,
    @Body() dto: CreateCompanyAddressDto,
  ) {
    return this.companiesService.addAddress(companyId, dto);
  }

  @Patch(':id/addresses/:addressId')
  @RequirePermissions('companies.manage')
  async updateAddress(
    @Param('id') companyId: string,
    @Param('addressId') addressId: string,
    @Body() dto: UpdateCompanyAddressDto,
  ) {
    return this.companiesService.updateAddress(companyId, addressId, dto);
  }

  @Delete(':id/addresses/:addressId')
  @RequirePermissions('companies.manage')
  async removeAddress(
    @Param('id') companyId: string,
    @Param('addressId') addressId: string,
  ) {
    return this.companiesService.updateAddress(companyId, addressId, {
      isActive: false,
    });
  }

  @Put(':id/working-days')
  @RequirePermissions('companies.manage')
  async updateWorkingDay(
    @Param('id') companyId: string,
    @Body() dto: UpdateCompanyWorkingDayDto,
  ) {
    return this.companiesService.updateWorkingDay(companyId, dto);
  }

  @Post(':id/holidays')
  @RequirePermissions('companies.manage')
  async addHoliday(
    @Param('id') companyId: string,
    @Body() dto: CreateCompanyHolidayDto,
  ) {
    return this.companiesService.addHoliday(companyId, dto);
  }

  @Delete(':id/holidays/:holidayId')
  @RequirePermissions('companies.manage')
  async removeHoliday(
    @Param('id') companyId: string,
    @Param('holidayId') holidayId: string,
  ) {
    return this.companiesService.removeHoliday(companyId, holidayId);
  }

  @Get(':id/delivery-day-check')
  @RequirePermissions('companies.read')
  async checkDeliveryDay(
    @Param('id') companyId: string,
    @Query('date') date: string,
  ) {
    return this.companiesService.isDeliveryDay(companyId, date);
  }
}
