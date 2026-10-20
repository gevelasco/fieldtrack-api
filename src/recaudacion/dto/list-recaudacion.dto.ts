import { Transform, Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Matches, MaxLength, Min } from 'class-validator';
import { PAGE_SIZES } from '../../members/dto/member.dto';

export const RECAUDACION_KINDS = ['membership', 'hunting_tag', 'competition'] as const;
export type RecaudacionKind = (typeof RECAUDACION_KINDS)[number];

const YEAR_MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

export class ListRecaudacionQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;

  /** Primer mes incluido (YYYY-MM). */
  @IsString()
  @Matches(YEAR_MONTH)
  from: string;

  /** Último mes incluido (YYYY-MM). */
  @IsString()
  @Matches(YEAR_MONTH)
  to: string;

  @IsOptional()
  @Transform(({ value }) => parseKinds(value))
  kinds?: RecaudacionKind[];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsIn(PAGE_SIZES)
  pageSize?: number;
}

function parseKinds(value: unknown): RecaudacionKind[] | undefined {
  if (value == null || value === '') {
    return undefined;
  }
  const raw = Array.isArray(value) ? value : String(value).split(',');
  const parsed = raw
    .flatMap((part) => String(part).split(','))
    .map((part) => part.trim())
    .filter((part): part is RecaudacionKind =>
      (RECAUDACION_KINDS as readonly string[]).includes(part),
    );
  return parsed.length > 0 ? [...new Set(parsed)] : undefined;
}
