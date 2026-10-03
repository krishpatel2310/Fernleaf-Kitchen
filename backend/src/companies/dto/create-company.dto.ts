import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEmail,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { CreateCompanyAddressDto } from './company-address.dto';

export class CreateCompanyDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  domains: string[];

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateCompanyAddressDto)
  addresses: CreateCompanyAddressDto[];

  @IsString()
  @IsNotEmpty()
  billingContactName: string;

  @IsEmail()
  billingContactEmail: string;

  @IsString()
  @IsOptional()
  billingContactPhone?: string;

  @IsInt()
  @Min(0)
  @Max(1439)
  defaultDeliveryTimeMinutes: number;

  @IsInt()
  @Min(0)
  @IsOptional()
  deliveryMinutesBefore?: number = 60;

  @IsString()
  @IsNotEmpty()
  defaultPackagingTypeId: string;

  @IsString()
  @IsOptional()
  defaultDriverId?: string;

  @IsString()
  @IsOptional()
  driverInstructions?: string;

  @IsString()
  @IsOptional()
  priceTierId?: string;

  @IsString()
  @IsOptional()
  ownerEmployeeId?: string;
}
