import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class UpdateEmployeeDto {
  @IsString()
  @IsOptional()
  firstName?: string;

  @IsString()
  @IsOptional()
  lastName?: string;

  @IsEmail()
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @IsBoolean()
  @IsOptional()
  canChooseDeliveryAddress?: boolean;

  @IsBoolean()
  @IsOptional()
  canChangeDeliveryTime?: boolean;

  @IsBoolean()
  @IsOptional()
  canChangePackaging?: boolean;

  @IsString()
  @IsOptional()
  defaultDeliveryAddressId?: string | null;

  @IsInt()
  @Min(0)
  @Max(1439)
  @IsOptional()
  defaultDeliveryTimeMinutes?: number | null;

  @IsString()
  @IsOptional()
  defaultPackagingTypeId?: string | null;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  allergenIds?: string[];

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  dietaryTagIds?: string[];
}
