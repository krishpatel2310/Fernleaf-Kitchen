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

export class OptionGroupOptionLinkDto {
  @IsString()
  @IsNotEmpty()
  optionId: string;

  @IsInt()
  @Min(0)
  @IsOptional()
  displayOrder?: number;
}

export class OptionGroupPortionLinkDto {
  @IsString()
  @IsNotEmpty()
  portionSizeId: string;

  @IsInt()
  @Min(0)
  @IsOptional()
  displayOrder?: number;

  @IsInt()
  @Min(0)
  @IsOptional()
  extraPriceCents?: number;
}

export class CreateOptionGroupDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsBoolean()
  @IsOptional()
  isRequired?: boolean = true;

  @IsInt()
  @Min(0)
  @IsOptional()
  displayOrder?: number = 0;

  @IsBoolean()
  @IsOptional()
  usesPortions?: boolean = false;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OptionGroupOptionLinkDto)
  @IsOptional()
  options?: OptionGroupOptionLinkDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OptionGroupPortionLinkDto)
  @IsOptional()
  portions?: OptionGroupPortionLinkDto[];
}

export class UpdateOptionGroupDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsBoolean()
  @IsOptional()
  isRequired?: boolean;

  @IsInt()
  @Min(0)
  @IsOptional()
  displayOrder?: number;

  @IsBoolean()
  @IsOptional()
  usesPortions?: boolean;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OptionGroupOptionLinkDto)
  @IsOptional()
  options?: OptionGroupOptionLinkDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OptionGroupPortionLinkDto)
  @IsOptional()
  portions?: OptionGroupPortionLinkDto[];
}
