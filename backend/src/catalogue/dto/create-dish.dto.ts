import { Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { Temperature } from '@prisma/client';

export class DishOptionGroupLinkDto {
  @IsString()
  @IsNotEmpty()
  optionGroupId: string;

  @IsInt()
  @Min(0)
  @IsOptional()
  displayOrder?: number;
}

export class CreateDishDto {
  @IsString()
  @IsNotEmpty()
  sku: string;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  imageUrl?: string;

  @IsEnum(Temperature)
  temperature: Temperature;

  @IsInt()
  @Min(0)
  costPriceCents: number;

  @IsInt()
  @Min(1)
  @IsOptional()
  minimumOrderQuantity?: number;

  @IsString()
  @IsOptional()
  kitchenStationId?: string;

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
