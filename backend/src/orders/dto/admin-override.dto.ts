import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class AdminOverrideDto {
  @IsString()
  @IsOptional()
  deliveryAddressId?: string;

  @IsString()
  @IsOptional()
  companyAddressId?: string;

  @IsInt()
  @Min(0)
  @Max(1439)
  @IsOptional()
  deliveryTimeMinutes?: number;

  @IsString()
  @IsOptional()
  packagingTypeId?: string;

  @IsString()
  @IsNotEmpty()
  note: string;
}
