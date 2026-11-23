import { Module } from '@nestjs/common';
import { SessionModule } from '../session/session.module';
import { ReportesController } from './reportes.controller';
import { ReportesService } from './reportes.service';

@Module({
  imports: [SessionModule],
  controllers: [ReportesController],
  providers: [ReportesService],
})
export class ReportesModule {}