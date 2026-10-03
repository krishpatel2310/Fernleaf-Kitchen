import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Body,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { BillingService } from './billing.service';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { InvoiceQueryDto } from './dto/invoice-query.dto';

@Controller('billing')
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  @Get('invoices')
  @RequirePermissions('billing.read')
  async findAllInvoices(@Query() query: InvoiceQueryDto) {
    return this.billingService.findAllInvoices(query);
  }

  @Get('invoices/:id')
  @RequirePermissions('billing.read')
  async findOneInvoice(@Param('id') id: string) {
    return this.billingService.findOneInvoice(id);
  }

  @Get('uninvoiced-orders')
  @RequirePermissions('billing.read')
  async getUninvoicedOrders(@Query('companyId') companyId?: string) {
    return this.billingService.getUninvoicedConfirmedOrders(companyId);
  }

  @Get('uninvoiced-orders/:companyId')
  @RequirePermissions('billing.read')
  async getUninvoicedConfirmedOrders(@Param('companyId') companyId: string) {
    return this.billingService.getUninvoicedConfirmedOrders(companyId);
  }

  @Post('invoices')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions('billing.manage')
  async createInvoice(@Body() dto: CreateInvoiceDto) {
    return this.billingService.createInvoice(dto);
  }

  @Post('invoices/:id/mark-paid')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('billing.manage')
  async markInvoicePaid(@Param('id') id: string) {
    return this.billingService.markInvoicePaid(id);
  }

  @Post('invoices/:id/pay')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('billing.manage')
  async payInvoice(@Param('id') id: string) {
    return this.billingService.markInvoicePaid(id);
  }
}
