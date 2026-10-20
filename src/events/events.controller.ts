import { Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SessionService } from '../session/session.service';
import { ListEventsQueryDto, SaveEventDto } from './dto/event.dto';
import { EventsService } from './events.service';

@ApiTags('events')
@Controller('events')
export class EventsController {
  constructor(
    private readonly events: EventsService,
    private readonly session: SessionService,
  ) {}

  @Get()
  async list(@Query() query: ListEventsQueryDto) {
    const actor = await this.session.current();
    return this.events.list(actor.club.id, actor.user, query);
  }

  @Get(':eventId')
  async detail(@Param('eventId', ParseIntPipe) eventId: number) {
    const actor = await this.session.current();
    return this.events.detail(actor.club.id, eventId, actor.user);
  }

  @Post()
  async create(@Body() dto: SaveEventDto) {
    const actor = await this.session.current();
    return this.events.create(actor.club.id, actor.user, dto);
  }

  @Patch(':eventId')
  async update(@Param('eventId', ParseIntPipe) eventId: number, @Body() dto: SaveEventDto) {
    const actor = await this.session.current();
    return this.events.update(actor.club.id, eventId, actor.user, dto);
  }

  @Delete(':eventId')
  @HttpCode(204)
  async remove(@Param('eventId', ParseIntPipe) eventId: number) {
    const actor = await this.session.current();
    await this.events.remove(actor.club.id, eventId, actor.user);
  }
}
