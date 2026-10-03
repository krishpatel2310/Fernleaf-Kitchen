import { Type } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsNotEmpty,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export class DishPriceItemDto {
  @IsString()
  @IsNotEmpty()
  dishId: string;

  @IsInt()
  @Min(0)
  priceCents: number;
}

export class BulkUpdateDishPricesDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DishPriceItemDto)
  prices: DishPriceItemDto[];
}

export class OptionPriceItemDto {
  @IsString()
  @IsNotEmpty()
  optionId: string;

  @IsInt()
  @Min(0)
  priceCents: number;
}

export class BulkUpdateOptionPricesDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OptionPriceItemDto)
  prices: OptionPriceItemDto[];
}
