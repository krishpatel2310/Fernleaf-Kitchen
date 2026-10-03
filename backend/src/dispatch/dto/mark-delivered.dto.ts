import { IsOptional, IsString, MaxLength } from 'class-validator';

export class MarkDeliveredDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  photoUrl?: string;
}
