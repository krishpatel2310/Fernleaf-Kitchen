import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { PriceRuleType } from '@prisma/client';

export class UpdatePriceTierDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsBoolean()
  @IsOptional()
  isDefault?: boolean;

  @IsString()
  @IsOptional()
  derivedFromTierId?: string | null;

  @IsEnum(PriceRuleType)
  @IsOptional()
  ruleType?: PriceRuleType;

  @IsInt()
  @Min(0)
  @IsOptional()
  ruleValueBps?: number | null;
}
