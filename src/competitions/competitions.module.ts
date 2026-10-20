import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClubEvent } from '../events/entities/club-event.entity';
import { Member } from '../members/entities/member.entity';
import { NotificationsModule } from '../notifications/notifications.module';
import { SessionModule } from '../session/session.module';
import { CompetitionsController } from './competitions.controller';
import { CompetitionsService } from './competitions.service';
import { CompetitionDiscipline } from './entities/competition-discipline.entity';
import { CompetitionEdition } from './entities/competition-edition.entity';
import { CompetitionRegistration } from './entities/competition-registration.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      CompetitionDiscipline,
      CompetitionEdition,
      CompetitionRegistration,
      Member,
      ClubEvent,
    ]),
    SessionModule,
    NotificationsModule,
  ],
  controllers: [CompetitionsController],
  providers: [CompetitionsService],
})
export class CompetitionsModule {}
