import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Club } from '../clubs/entities/club.entity';
import { NotificationsModule } from '../notifications/notifications.module';
import { RequestsModule } from '../requests/requests.module';
import { SessionModule } from '../session/session.module';
import { MemberDocument } from './entities/member-document.entity';
import { MemberPeta } from './entities/member-peta.entity';
import { MemberWeapon } from './entities/member-weapon.entity';
import { Member } from './entities/member.entity';
import { MembershipPayment } from './entities/membership-payment.entity';
import { ClubMembershipType } from '../clubs/entities/club-membership-type.entity';
import { MembersController } from './members.controller';
import { MembersImportService } from './members-import.service';
import { MembersService } from './members.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Member,
      MemberDocument,
      MemberWeapon,
      MemberPeta,
      MembershipPayment,
      Club,
      ClubMembershipType,
    ]),
    forwardRef(() => SessionModule),
    NotificationsModule,
    forwardRef(() => RequestsModule),
  ],
  controllers: [MembersController],
  providers: [MembersService, MembersImportService],
  exports: [MembersService, MembersImportService],
})
export class MembersModule {}
