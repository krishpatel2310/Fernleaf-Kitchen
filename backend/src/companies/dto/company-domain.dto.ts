import { IsNotEmpty, IsString } from 'class-validator';

export class AddCompanyDomainDto {
  @IsString()
  @IsNotEmpty()
  domain: string;
}
