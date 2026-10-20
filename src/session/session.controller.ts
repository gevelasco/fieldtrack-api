import { Body, Controller, Get, Patch, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthService } from '../auth/auth.service';
import { ChangePasswordDto } from '../auth/dto/change-password.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ClubSettingsService } from '../clubs/club-settings.service';
import { mapSession, SessionService } from './session.service';

@ApiTags('session')
@Controller('session')
export class SessionController {
  constructor(
    private readonly session: SessionService,
    private readonly auth: AuthService,
    private readonly clubSettings: ClubSettingsService,
  ) {}

  @Get()
  async current() {
    const actor = await this.session.current();
    const settings = await this.clubSettings.read(actor.club.id);
    return mapSession(
      actor.user,
      actor.club,
      actor.theme,
      settings.requiredDocuments,
      settings.membershipTypes,
      actor.memberNumber,
    );
  }

  @Patch('profile')
  @ApiOperation({ summary: 'Actualizar perfil, foto o tema de quien tiene la sesión' })
  async profile(@Body() dto: UpdateProfileDto) {
    const actor = await this.session.current();
    const user = await this.session.updateProfile(actor.user.id, dto);
    const theme = dto.theme ?? actor.theme;
    const settings = await this.clubSettings.read(actor.club.id);
    return mapSession(
      user,
      actor.club,
      theme,
      settings.requiredDocuments,
      settings.membershipTypes,
      actor.memberNumber,
    );
  }

  @Post('password')
  @ApiOperation({ summary: 'Cambiar la contraseña de quien tiene la sesión' })
  async password(@Body() dto: ChangePasswordDto) {
    const actor = await this.session.current();
    await this.auth.changePassword(actor.user.id, dto.currentPassword, dto.password);
    return { ok: true };
  }
}
