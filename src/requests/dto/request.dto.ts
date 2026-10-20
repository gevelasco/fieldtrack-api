import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
export const REQUEST_KINDS = ['member', 'internal'] as const;
export const REQUEST_STATUSES = ['new', 'in_progress', 'completed'] as const;
/** `all` incluye todos los estados; `open` agrupa nuevas y en proceso. */
export const REQUEST_VIEWS = ['all', 'open', 'new', 'in_progress', 'completed'] as const;
export const REQUEST_PAGE_SIZE = 30;
export const MAX_REQUEST_DOCUMENTS = 10;

export type RequestView = (typeof REQUEST_VIEWS)[number];

export class ListRequestsQueryDto {
  @IsOptional()
  @IsIn(REQUEST_VIEWS)
  view?: RequestView;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;
}

export class RequestFileDto {
  @IsString()
  @MaxLength(240)
  fileName: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  contentType?: string;

  @IsString()
  contentBase64: string;
}

export class SaveRequestDto {
  @IsIn(REQUEST_KINDS)
  kind: (typeof REQUEST_KINDS)[number];

  @ValidateIf((dto: SaveRequestDto) => dto.kind === 'member')
  @Type(() => Number)
  @IsInt()
  @Min(1)
  memberId?: number | null;

  @IsString()
  @MaxLength(160)
  title: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  description?: string;
}

export class CreateRequestDto extends SaveRequestDto {
  @IsOptional()
  @ArrayMaxSize(MAX_REQUEST_DOCUMENTS)
  @ValidateNested({ each: true })
  @Type(() => RequestFileDto)
  documents?: RequestFileDto[];
}

export class ChangeRequestStatusDto {
  @IsIn(REQUEST_STATUSES)
  status: (typeof REQUEST_STATUSES)[number];
}

export class RequestCommentDto {
  @IsString()
  @MaxLength(4000)
  body: string;
}

export class MemberCreateRequestDto {
  @IsString()
  @MaxLength(160)
  title: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  description?: string;

  @IsOptional()
  @ArrayMaxSize(MAX_REQUEST_DOCUMENTS)
  @ValidateNested({ each: true })
  @Type(() => RequestFileDto)
  documents?: RequestFileDto[];
}

export class MemberSubmitRequestDto {
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  message?: string;

  @IsOptional()
  @ArrayMaxSize(MAX_REQUEST_DOCUMENTS)
  @ValidateNested({ each: true })
  @Type(() => RequestFileDto)
  documents?: RequestFileDto[];
}
