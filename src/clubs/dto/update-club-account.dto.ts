import { IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class UpdateClubAccountDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  tagline?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(16)
  @Matches(/^[^\s]*$/, { message: 'El prefijo no debe incluir espacios.' })
  memberNumberPrefix?: string;

  @IsOptional()
  @IsString()
  logoDataUrl?: string | null;
}
