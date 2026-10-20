import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SessionModule } from '../session/session.module';
import { ChecklistController } from './checklist.controller';
import { ChecklistService } from './checklist.service';
import { UserChecklistItem } from './entities/user-checklist-item.entity';

@Module({
  imports: [TypeOrmModule.forFeature([UserChecklistItem]), SessionModule],
  controllers: [ChecklistController],
  providers: [ChecklistService],
})
export class ChecklistModule {}
