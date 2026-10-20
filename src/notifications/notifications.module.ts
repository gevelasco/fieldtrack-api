import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Member } from '../members/entities/member.entity';
import { SessionModule } from '../session/session.module';
import { ClubNotificationRead } from './entities/club-notification-read.entity';
import { ClubNotification } from './entities/club-notification.entity';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([ClubNotification, ClubNotificationRead, Member]),
    SessionModule,
  ],
  controllers: [NotificationsController],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
