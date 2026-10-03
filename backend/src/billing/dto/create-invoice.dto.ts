import {
  IsArray,
  ArrayMinSize,
  ArrayUnique,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateInvoiceDto {
  @IsString()
  @IsNotEmpty({ message: 'companyId is required' })
  companyId: string;

  @IsArray({ message: 'orderIds must be an array of order IDs' })
  @ArrayMinSize(1, {
    message: 'At least one order must be specified to create an invoice',
  })
  @ArrayUnique({ message: 'Duplicate order IDs are not allowed in an invoice' })
  @IsString({ each: true, message: 'Each order ID must be a string' })
  orderIds: string[];

  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'Notes must be 500 characters or fewer' })
  notes?: string;

  @IsOptional()
  @IsString()
  invoiceNumber?: string;
}
