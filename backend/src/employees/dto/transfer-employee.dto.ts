import { IsEmail, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class TransferEmployeeDto {
  @IsString()
  @IsNotEmpty()
  newCompanyId: string;

  @IsString()
  @IsOptional()
  newDefaultAddressId?: string;

  @IsEmail()
  @IsOptional()
  newEmail?: string;
}
