import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ListRecaudacionQueryDto } from './dto/list-recaudacion.dto';
import { PAGE_SIZES } from '../members/dto/member.dto';
import { monthBounds, searchRecaudacion } from './recaudacion.queries';

@Injectable()
export class RecaudacionService {
  constructor(private readonly dataSource: DataSource) {}

  list(clubId: number, query: ListRecaudacionQueryDto) {
    const pageSize = query.pageSize ?? PAGE_SIZES[0];
    const { fromDate, toDate } = monthBounds(query.from, query.to);
    return searchRecaudacion(this.dataSource.manager, {
      clubId,
      search: query.search ?? '',
      fromDate,
      toDate,
      kinds: query.kinds ?? [],
      page: query.page ?? 1,
      pageSize,
    });
  }
}
