import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { Temperature } from '@prisma/client';
import { DishOptionGroupLinkDto } from './create-dish.dto';

export class UpdateDishDto {
  @IsString()
  @IsOptional()
  sku?: string;

  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  imageUrl?: string;

  @IsEnum(Temperature)
  @IsOptional()
  temperature?: Temperature;

  @IsInt()
  @Min(0)
  @IsOptional()
  costPriceCents?: number;

  @IsInt()
  @Min(1)
  @IsOptional()
  minimumOrderQuantity?: number | null;

  @IsString()
  @IsOptional()
  kitchenStationId?: string | null;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  allergenIds?: string[];

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  dietaryTagIds?: string[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DishOptionGroupLinkDto)
  @IsOptional()
  optionGroups?: DishOptionGroupLinkDto[];
}
