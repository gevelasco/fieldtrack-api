import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { StreamableFile } from '@nestjs/common/file-stream';
import { assertStaffModuleAccess } from '../clubs/staff-access';
import { SessionService } from '../session/session.service';
import { ListReportesQueryDto } from './dto/list-reportes.dto';
import { ReportesService } from './reportes.service';
import { sedenaExportFilename } from './sedena-export';

@ApiTags('reportes')
@Controller('reportes')
export class ReportesController {
  constructor(
    private readonly reportes: ReportesService,
    private readonly session: SessionService,
  ) {}

  @Get('sedena')
  async sedena(@Query() query: ListReportesQueryDto) {
    const actor = await this.session.current();
    assertStaffModuleAccess(actor.user, 'reportes', 'view');
    return this.reportes.list(actor.club.id, query);
  }

  @Get('sedena/export')
  async sedenaExport(@Query() query: ListReportesQueryDto) {
    const actor = await this.session.current();
    assertStaffModuleAccess(actor.user, 'reportes', 'view');
    const buffer = await this.reportes.exportSedena(actor.club.id, query);
    const filename = sedenaExportFilename(query.from, query.to);
    return new StreamableFile(buffer, {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      disposition: `attachment; filename="${encodeURIComponent(filename)}"`,
    });
  }
}