import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { SPECIES_ICONS } from '../entities/hunting-species.entity';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export class SaveSeasonDto {
  @IsString({ message: 'Escribe el nombre de la temporada.' })
  @MaxLength(120, { message: 'El nombre de la temporada es demasiado largo.' })
  label: string;

  @Matches(DATE, { message: 'La fecha de inicio debe tener el formato AAAA-MM-DD.' })
  startsOn: string;

  @Matches(DATE, { message: 'La fecha de cierre debe tener el formato AAAA-MM-DD.' })
  endsOn: string;

  @Type(() => Number)
  @IsInt({ message: 'La cantidad de cintillos debe ser un número entero.' })
  @Min(1, { message: 'La temporada debe tener al menos un cintillo.' })
  @Max(10000, { message: 'La cantidad de cintillos es demasiado grande.' })
  tagCount: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'El precio del cintillo debe ser un número.' })
  @Min(0, { message: 'El precio del cintillo no puede ser negativo.' })
  @Max(10_000_000, { message: 'El precio del cintillo es demasiado grande.' })
  tagPrice: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000, { message: 'Las reglas o notas son demasiado largas.' })
  notes?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[0-9]{1,12}$/, { message: 'El folio inicial solo puede tener números (hasta 12 dígitos).' })
  firstFolio?: string;
}

export class CreateSeasonDto extends SaveSeasonDto {
  @Type(() => Number)
  @IsInt({ message: 'Elige la especie.' })
  speciesId: number;
}

export class SaveSpeciesDto {
  @IsString({ message: 'Escribe el nombre de la especie.' })
  @MaxLength(80, { message: 'El nombre de la especie es demasiado largo.' })
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(120, { message: 'El nombre científico es demasiado largo.' })
  scientificName?: string;

  @IsIn(SPECIES_ICONS, { message: 'Elige el ícono de la especie.' })
  icon: (typeof SPECIES_ICONS)[number];
}

/** Al registrar una especie se captura también su temporada actual, aunque ya haya pasado. */
export class CreateSpeciesDto extends SaveSpeciesDto {
  @ValidateNested()
  @Type(() => SaveSeasonDto)
  season: SaveSeasonDto;
}

export class SellTagDto {
  @Type(() => Number)
  @IsInt({ message: 'Elige al socio.' })
  memberId: number;

  @IsString({ message: 'Escribe el folio del cintillo.' })
  @MaxLength(40, { message: 'El folio es demasiado largo.' })
  folio: string;

  @Matches(DATE, { message: 'La fecha de pago debe tener el formato AAAA-MM-DD.' })
  paidOn: string;
}
