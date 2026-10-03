import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class CreateEmployeeDto {
  @IsString()
  @IsNotEmpty()
  companyId: string;

  @IsString()
  @IsNotEmpty()
  firstName: string;

  @IsString()
  @IsNotEmpty()
  lastName: string;

  @IsEmail()
  email: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsBoolean()
  @IsOptional()
  canChooseDeliveryAddress?: boolean = false;

  @IsBoolean()
  @IsOptional()
  canChangeDeliveryTime?: boolean = false;

  @IsBoolean()
  @IsOptional()
  canChangePackaging?: boolean = false;

  @IsString()
  @IsOptional()
  defaultDeliveryAddressId?: string;

  @IsInt()
  @Min(0)
  @Max(1439)
  @IsOptional()
  defaultDeliveryTimeMinutes?: number;

  @IsString()
  @IsOptional()
  defaultPackagingTypeId?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  allergenIds?: string[];

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  dietaryTagIds?: string[];
}
