import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const SEX = ['hombre', 'mujer', 'otro'] as const;
const MEMBERSHIP = ['tiro-deportivo', 'caza'] as const;
const PLATFORM = ['pistola', 'revolver', 'escopeta', 'rifle', 'otro'] as const;
const WEAPON_MODALITY = [
  'proteccion-domicilio',
  'proteccion-parcela',
  'tiro-deportivo',
  'caceria',
] as const;
const PETA_TYPE = ['caceria', 'tiro-competencia', 'tiro-campo'] as const;
const DOCUMENT_SLOT_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export class FilePayloadDto {
  @IsString()
  @MaxLength(240)
  fileName: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  contentType?: string;

  @IsOptional()
  @IsString()
  contentBase64?: string;
}

export class WeaponPayloadDto {
  @IsOptional()
  @IsString()
  id?: string;

  @IsString()
  @MaxLength(80)
  brand: string;

  @IsString()
  @MaxLength(80)
  model: string;

  @IsString()
  @MaxLength(40)
  caliber: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  serialNumber?: string;

  @IsIn(PLATFORM)
  platform: (typeof PLATFORM)[number];

  @IsIn(WEAPON_MODALITY)
  modality: (typeof WEAPON_MODALITY)[number];

  @IsBoolean()
  hasPeta: boolean;

  @Matches(DATE)
  registeredOn: string;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @ValidateNested()
  @Type(() => FilePayloadDto)
  sheet?: FilePayloadDto | null;
}

export class DocumentPayloadDto {
  @IsString()
  @Matches(DOCUMENT_SLOT_PATTERN)
  @MaxLength(64)
  slot: string;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  fileName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  contentType?: string;

  @IsOptional()
  @IsString()
  contentBase64?: string;

  @IsOptional()
  @Matches(DATE)
  loadedOn?: string;
}

export class PetaPayloadDto {
  @IsIn(PETA_TYPE)
  permitType: (typeof PETA_TYPE)[number];

  @IsString()
  @MaxLength(240)
  fileName: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  contentType?: string;

  @IsOptional()
  @IsString()
  contentBase64?: string;

  @Matches(DATE)
  loadedOn: string;
}

export class CreateMemberDto {
  @IsString()
  @MaxLength(32)
  memberNumber: string;

  @IsString()
  @MaxLength(80)
  firstName: string;

  @IsString()
  @MaxLength(80)
  paternalSurname: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  maternalSurname?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;

  @Matches(DATE)
  joinedOn: string;

  @IsIn(SEX)
  sex: (typeof SEX)[number];

  @IsIn(MEMBERSHIP)
  membership: (typeof MEMBERSHIP)[number];

  @IsOptional()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => WeaponPayloadDto)
  weapons?: WeaponPayloadDto[];

  @IsOptional()
  @ArrayMaxSize(8)
  @ValidateNested({ each: true })
  @Type(() => DocumentPayloadDto)
  documents?: DocumentPayloadDto[];
}

export class UpdateMemberDto {
  @IsString()
  @MaxLength(80)
  firstName: string;

  @IsString()
  @MaxLength(80)
  paternalSurname: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  maternalSurname?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;

  @IsIn(SEX)
  sex: (typeof SEX)[number];

  @IsIn(MEMBERSHIP)
  membership: (typeof MEMBERSHIP)[number];

  @IsOptional()
  @ArrayMaxSize(8)
  @ValidateNested({ each: true })
  @Type(() => DocumentPayloadDto)
  documents?: DocumentPayloadDto[];
}

export class ReplaceWeaponsDto {
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => WeaponPayloadDto)
  weapons: WeaponPayloadDto[];
}

export class ReplacePetasDto {
  @ArrayMaxSize(3)
  @ValidateNested({ each: true })
  @Type(() => PetaPayloadDto)
  petas: PetaPayloadDto[];
}

export const PAGE_SIZES = [10, 25, 50] as const;
export const MEMBER_SORTS = ['requests', 'status', 'seniority'] as const;
export const SORT_DIRECTIONS = ['asc', 'desc'] as const;

export class ListMembersQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;

  @IsOptional()
  @IsIn(MEMBERSHIP)
  membership?: (typeof MEMBERSHIP)[number];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsIn(PAGE_SIZES)
  pageSize?: number;

  @IsOptional()
  @IsIn(MEMBER_SORTS)
  sort?: (typeof MEMBER_SORTS)[number];

  @IsOptional()
  @IsIn(SORT_DIRECTIONS)
  direction?: (typeof SORT_DIRECTIONS)[number];
}

export class RecordPaymentDto {
  @Matches(DATE)
  paidOn: string;

  @IsOptional()
  @Matches(DATE)
  periodStart?: string;
}

export class ResetMemberPasswordDto {
  @IsString()
  @MinLength(8, { message: 'La contraseña debe tener al menos 8 caracteres.' })
  @MaxLength(72, { message: 'La contraseña es demasiado larga.' })
  password: string;
}

/** Sin `slot` se piden todos los documentos pendientes; con `slot`, la renovación de ese documento. */
export class RequestMemberDocumentsDto {
  @IsOptional()
  @IsString()
  @Matches(DOCUMENT_SLOT_PATTERN)
  @MaxLength(64)
  slot?: string;
}
