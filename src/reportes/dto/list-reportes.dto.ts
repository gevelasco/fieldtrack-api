import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Matches, Min } from 'class-validator';
import { PAGE_SIZES } from '../../members/dto/member.dto';

const YEAR_MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

export class ListReportesQueryDto {
  @IsString()
  @Matches(YEAR_MONTH)
  from: string;

  @IsString()
  @Matches(YEAR_MONTH)
  to: string;

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