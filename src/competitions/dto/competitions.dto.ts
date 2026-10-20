import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

export class SaveDisciplineDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class SaveEditionDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  venue?: string;

  @IsString()
  startsOn!: string;

  @IsString()
  endsOn!: string;

  @IsOptional()
  @IsString()
  startTime?: string | null;

  @IsOptional()
  @IsString()
  endTime?: string | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxParticipants?: number | null;

  @IsNumber()
  @Min(0)
  entryFee!: number;

  @IsString()
  registrationOpens!: string;

  @IsString()
  registrationCloses!: string;

  @IsString()
  paymentDeadline!: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  notes?: string;

  /** null u omitido = abierto; referencia niveles sporting/compak (FECAZA). */
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsIn(['open', 'iniciados', 'c', 'b', 'a'])
  minimumLevel?: 'open' | 'iniciados' | 'c' | 'b' | 'a' | null;
}

export class CreateDisciplineDto extends SaveDisciplineDto {
  @ValidateNested()
  @Type(() => SaveEditionDto)
  edition!: SaveEditionDto;
}

export class CreateEditionDto extends SaveEditionDto {
  @IsInt()
  @Min(1)
  disciplineId!: number;
}

export class PreRegisterDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  memberId?: number;
}

export class RegisterGuestDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  guestName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  guestPhone?: string;
}

export class SaveScoreDto {
  @IsNumber()
  @Min(0)
  score!: number;
}

export class RankingWinnerDto {
  @ValidateIf((row: RankingWinnerDto) => !row.guestName?.trim())
  @IsInt()
  @Min(1)
  memberId?: number;

  @ValidateIf((row: RankingWinnerDto) => !row.memberId)
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  guestName?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  score?: number;
}

/** Orden del arreglo: 1.er … 5.° lugar (1 a 5 ítems). */
export class PublishWinnersDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(5)
  @ValidateNested({ each: true })
  @Type(() => RankingWinnerDto)
  places!: RankingWinnerDto[];
}
