import { IsOptional, IsString } from 'class-validator';

export class AssignDriverDto {
  @IsOptional()
  @IsString()
  driverId?: string | null;
}
