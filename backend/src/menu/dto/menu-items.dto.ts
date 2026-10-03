import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export class AddCategoryDishDto {
  @IsString()
  @IsNotEmpty()
  dishId: string;

  @IsInt()
  @Min(0)
  @IsOptional()
  displayOrder?: number;
}

export class CategoryReorderItemDto {
  @IsString()
  @IsNotEmpty()
  id: string;

  @IsInt()
  @Min(0)
  displayOrder: number;
}

export class ReorderCategoriesDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CategoryReorderItemDto)
  items: CategoryReorderItemDto[];
}

export class CategoryDishReorderItemDto {
  @IsString()
  @IsNotEmpty()
  dishId: string;

  @IsInt()
  @Min(0)
  displayOrder: number;
}

export class ReorderCategoryDishesDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CategoryDishReorderItemDto)
  items: CategoryDishReorderItemDto[];
}

export class SetCompanyVisibilityDto {
  @IsBoolean()
  hide: boolean;
}

export class MenuPreviewQueryDto {
  @IsString()
  @IsOptional()
  companyId?: string;

  @IsBoolean()
  @Type(() => Boolean)
  @IsOptional()
  includeSecret?: boolean = false;
}
