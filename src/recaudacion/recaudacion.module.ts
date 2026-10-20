import { Module } from '@nestjs/common';
import { SessionModule } from '../session/session.module';
import { RecaudacionController } from './recaudacion.controller';
import { RecaudacionService } from './recaudacion.service';

@Module({
  imports: [SessionModule],
  controllers: [RecaudacionController],
  providers: [RecaudacionService],
})
export class RecaudacionModule {}
