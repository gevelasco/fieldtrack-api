import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Club } from '../clubs/entities/club.entity';
import { ClubEvent } from '../events/entities/club-event.entity';
import { Member } from '../members/entities/member.entity';
import { NotificationsModule } from '../notifications/notifications.module';
import { SessionModule } from '../session/session.module';
import { HuntingSeason } from './entities/hunting-season.entity';
import { HuntingSpecies } from './entities/hunting-species.entity';
import { HuntingTagSale } from './entities/hunting-tag-sale.entity';
import { HuntingController } from './hunting.controller';
import { HuntingService } from './hunting.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([HuntingSpecies, HuntingSeason, HuntingTagSale, Member, Club, ClubEvent]),
    SessionModule,
    NotificationsModule,
  ],
  controllers: [HuntingController],
  providers: [HuntingService],
})
export class HuntingModule {}
