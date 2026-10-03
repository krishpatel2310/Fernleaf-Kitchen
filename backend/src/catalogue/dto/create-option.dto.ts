import {
  IsArray,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class CreateOptionDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsInt()
  @Min(0)
  costPriceCents: number;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  allergenIds?: string[];

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  dietaryTagIds?: string[];
}

export class UpdateOptionDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsInt()
  @Min(0)
  @IsOptional()
  costPriceCents?: number;

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
}
