import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MembersModule } from '../members/members.module';
import { SessionModule } from '../session/session.module';
import { AppUser } from '../users/entities/app-user.entity';
import { UserPreferences } from '../users/entities/user-preferences.entity';
import { ClubAccountController } from './club-account.controller';
import { ClubAccountService } from './club-account.service';
import { ClubSettingsController } from './club-settings.controller';
import { ClubSettingsService } from './club-settings.service';
import { ClubStaffService } from './club-staff.service';
import { ClubMemberDocumentDef } from './entities/club-member-document-def.entity';
import { ClubMembershipType } from './entities/club-membership-type.entity';
import { Club } from './entities/club.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Club, ClubMemberDocumentDef, ClubMembershipType, AppUser, UserPreferences]),
    forwardRef(() => SessionModule),
    forwardRef(() => MembersModule),
  ],
  controllers: [ClubSettingsController, ClubAccountController],
  providers: [ClubSettingsService, ClubStaffService, ClubAccountService],
  exports: [ClubSettingsService, ClubStaffService, ClubAccountService],
})
export class ClubsModule {}
