import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { OrderStatus } from '@prisma/client';

export class CreateCombinationOptionDto {
  @IsString()
  @IsNotEmpty()
  optionGroupId: string;

  @IsString()
  @IsNotEmpty()
  optionId: string;

  @IsString()
  @IsOptional()
  portionSizeId?: string;
}

export class CreateOrderCombinationDto {
  @IsInt()
  @Min(1)
  quantity: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateCombinationOptionDto)
  @IsOptional()
  options?: CreateCombinationOptionDto[];
}

export class CreateOrderLineDto {
  @IsString()
  @IsNotEmpty()
  dishId: string;

  @IsInt()
  @Min(1)
  quantity: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateOrderCombinationDto)
  @IsOptional()
  combinations?: CreateOrderCombinationDto[];
}

export class CreateOrderDto {
  @IsString()
  @IsNotEmpty()
  employeeId: string;

  @IsDateString()
  deliveryDate: string; // YYYY-MM-DD

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

  @IsBoolean()
  @IsOptional()
  isPlaced?: boolean;

  @IsEnum(OrderStatus)
  @IsOptional()
  status?: OrderStatus;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateOrderLineDto)
  lines: CreateOrderLineDto[];
}
