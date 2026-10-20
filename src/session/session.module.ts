import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClubsModule } from '../clubs/clubs.module';
import { Club } from '../clubs/entities/club.entity';
import { Member } from '../members/entities/member.entity';
import { AppUser } from '../users/entities/app-user.entity';
import { UserPreferences } from '../users/entities/user-preferences.entity';
import { SessionController } from './session.controller';
import { SessionService } from './session.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([AppUser, Club, UserPreferences, Member]),
    forwardRef(() => ClubsModule),
  ],
  controllers: [SessionController],
  providers: [SessionService],
  exports: [SessionService],
})
export class SessionModule {}
