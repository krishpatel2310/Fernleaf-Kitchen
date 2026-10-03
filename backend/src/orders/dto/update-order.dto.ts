import {
  IsArray,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CreateOrderLineDto } from './create-order.dto';

export class UpdateOrderDto {
  @IsDateString()
  @IsOptional()
  deliveryDate?: string;

  @IsInt()
  @Min(0)
  @Max(1439)
  @IsOptional()
  deliveryTimeMinutes?: number;

  @IsString()
  @IsOptional()
  companyAddressId?: string;

  @IsString()
  @IsOptional()
  deliveryAddressId?: string;

  @IsString()
  @IsOptional()
  packagingTypeId?: string;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateOrderLineDto)
  @IsOptional()
  lines?: CreateOrderLineDto[];
}
