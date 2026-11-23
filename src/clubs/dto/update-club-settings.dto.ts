import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

const SLOT = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export class MembershipWindowDto {
  @IsInt()
  @Min(1)
  @Max(12)
  startMonth: number;

  @IsInt()
  @Min(1)
  @Max(31)
  startDay: number;

  @IsInt()
  @Min(1)
  @Max(12)
  endMonth: number;

  @IsInt()
  @Min(1)
  @Max(31)
  endDay: number;
}

export class RequiredDocumentDto {
  @IsString()
  @Matches(SLOT)
  @MaxLength(64)
  slot: string;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  label: string;

  @IsOptional()
  @IsIn(['na', '3m', '6m', '1y', '2y'])
  validityCode?: 'na' | '3m' | '6m' | '1y' | '2y';
}

export class MembershipTypeDto {
  @IsOptional()
  @IsString()
  @Matches(SLOT)
  @MaxLength(64)
  code?: string;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  feeMxn: number;

  @IsBoolean()
  allowsSportShooting: boolean;

  @IsBoolean()
  allowsHunting: boolean;

  @IsOptional()
  @IsIn(['mensual', 'semestral', 'anual'])
  billingPeriod?: 'mensual' | 'semestral' | 'anual';
}

export class UpdateClubSettingsDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  tagline?: string;

  @IsOptional()
  @IsString()
  @MaxLength(16)
  memberNumberPrefix?: string | null;

  @IsOptional()
  @IsString()
  logoDataUrl?: string | null;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  sportShootingFeeMxn?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  huntingFeeMxn?: number;

  @IsOptional()
  @ValidateNested()
  @Type(() => MembershipWindowDto)
  sportShooting?: MembershipWindowDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => MembershipWindowDto)
  hunting?: MembershipWindowDto;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(24)
  @ValidateNested({ each: true })
  @Type(() => RequiredDocumentDto)
  requiredDocuments?: RequiredDocumentDto[];

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(12)
  @ValidateNested({ each: true })
  @Type(() => MembershipTypeDto)
  membershipTypes?: MembershipTypeDto[];
}
