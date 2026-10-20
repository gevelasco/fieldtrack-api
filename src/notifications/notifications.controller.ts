import { Controller, Get, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SessionService } from '../session/session.service';
import { NotificationsService } from './notifications.service';

@ApiTags('notifications')
@Controller('notifications')
export class NotificationsController {
  constructor(
    private readonly notifications: NotificationsService,
    private readonly session: SessionService,
  ) {}

  @Get()
  async list() {
    const actor = await this.session.current();
    return this.notifications.list(actor.club.id, actor.user);
  }

  @Get('unread-count')
  async unreadCount() {
    const actor = await this.session.current();
    const unread = await this.notifications.unreadCount(actor.club.id, actor.user);
    return { unread };
  }

  @Post('read')
  async markRead() {
    const actor = await this.session.current();
    await this.notifications.markRead(actor.club.id, actor.user);
    return this.notifications.list(actor.club.id, actor.user);
  }
}
