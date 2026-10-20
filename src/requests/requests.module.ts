import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClubsModule } from '../clubs/clubs.module';
import { Member } from '../members/entities/member.entity';
import { NotificationsModule } from '../notifications/notifications.module';
import { SessionModule } from '../session/session.module';
import { ClubRequestComment } from './entities/club-request-comment.entity';
import { ClubRequestDocument } from './entities/club-request-document.entity';
import { ClubRequestEvent } from './entities/club-request-event.entity';
import { ClubRequest } from './entities/club-request.entity';
import { RequestsController } from './requests.controller';
import { RequestsService } from './requests.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([ClubRequest, ClubRequestComment, ClubRequestDocument, ClubRequestEvent, Member]),
    forwardRef(() => SessionModule),
    forwardRef(() => ClubsModule),
    NotificationsModule,
  ],
  controllers: [RequestsController],
  providers: [RequestsService],
  exports: [RequestsService],
})
export class RequestsModule {}
