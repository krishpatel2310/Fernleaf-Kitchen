import { Controller, Get, Param, Query } from '@nestjs/common';
import { BillingService } from './billing.service';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { InvoiceStatus } from '@prisma/client';

@Controller('billing')
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  @Get('invoices')
  @RequirePermissions('billing.read')
  async findAllInvoices(
    @Query('companyId') companyId?: string,
    @Query('status') status?: InvoiceStatus,
  ) {
    return this.billingService.findAllInvoices(companyId, status);
  }

  @Get('invoices/:id')
  @RequirePermissions('billing.read')
  async findOneInvoice(@Param('id') id: string) {
    return this.billingService.findOneInvoice(id);
  }

  @Get('uninvoiced-orders/:companyId')
  @RequirePermissions('billing.read')
  async getUninvoicedConfirmedOrders(@Param('companyId') companyId: string) {
    return this.billingService.getUninvoicedConfirmedOrders(companyId);
  }
}
