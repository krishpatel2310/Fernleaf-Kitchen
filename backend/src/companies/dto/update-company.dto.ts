import {
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class UpdateCompanyDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  billingContactName?: string;

  @IsEmail()
  @IsOptional()
  billingContactEmail?: string;

  @IsString()
  @IsOptional()
  billingContactPhone?: string;

  @IsInt()
  @Min(0)
  @Max(1439)
  @IsOptional()
  defaultDeliveryTimeMinutes?: number;

  @IsInt()
  @Min(0)
  @IsOptional()
  deliveryMinutesBefore?: number;

  @IsString()
  @IsOptional()
  defaultPackagingTypeId?: string;

  @IsString()
  @IsOptional()
  defaultDriverId?: string | null;

  @IsString()
  @IsOptional()
  driverInstructions?: string | null;

  @IsString()
  @IsOptional()
  priceTierId?: string | null;

  @IsString()
  @IsOptional()
  ownerEmployeeId?: string | null;
}
