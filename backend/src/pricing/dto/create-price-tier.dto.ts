import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { PriceRuleType } from '@prisma/client';

export class CreatePriceTierDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsBoolean()
  @IsOptional()
  isDefault?: boolean;

  @IsString()
  @IsOptional()
  derivedFromTierId?: string;

  @IsEnum(PriceRuleType)
  @IsOptional()
  ruleType?: PriceRuleType;

  @IsInt()
  @Min(0)
  @IsOptional()
  ruleValueBps?: number;
}
