import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { PAGE_SIZES } from '../members/dto/member.dto';
import { ListReportesQueryDto } from './dto/list-reportes.dto';
import { loadReportes, loadSedenaMovementRows } from './reportes.queries';
import { buildSedenaMovementsWorkbook } from './sedena-export';
import { monthBounds } from '../recaudacion/recaudacion.queries';

@Injectable()
export class ReportesService {
  constructor(private readonly dataSource: DataSource) {}

  list(clubId: number, query: ListReportesQueryDto) {
    const pageSize = query.pageSize ?? PAGE_SIZES[0];
    return loadReportes(this.dataSource.manager, {
      clubId,
      fromYm: query.from,
      toYm: query.to,
      page: query.page ?? 1,
      pageSize,
    });
  }

  async exportSedena(clubId: number, query: ListReportesQueryDto): Promise<Buffer> {
    const { fromDate, toDate } = monthBounds(query.from, query.to);
    const rows = await loadSedenaMovementRows(this.dataSource.manager, clubId, fromDate, toDate);
    return buildSedenaMovementsWorkbook(rows);
  }
}