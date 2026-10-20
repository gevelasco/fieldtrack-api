import { Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SessionService } from '../session/session.service';
import { CompetitionsService } from './competitions.service';
import {
  CreateDisciplineDto,
  CreateEditionDto,
  PreRegisterDto,
  RegisterGuestDto,
  SaveDisciplineDto,
  SaveEditionDto,
  PublishWinnersDto,
  SaveScoreDto,
} from './dto/competitions.dto';

@ApiTags('competitions')
@Controller('competitions')
export class CompetitionsController {
  constructor(
    private readonly competitions: CompetitionsService,
    private readonly session: SessionService,
  ) {}

  @Get('disciplines')
  async list() {
    const actor = await this.session.current();
    return this.competitions.list(actor.club.id);
  }

  @Get('open')
  async open() {
    const actor = await this.session.current();
    return this.competitions.openForMembers(actor.club.id, actor.user);
  }

  @Post('disciplines')
  async createDiscipline(@Body() dto: CreateDisciplineDto) {
    const actor = await this.session.current();
    return this.competitions.createDiscipline(actor.club.id, actor.user, dto);
  }

  @Patch('disciplines/:disciplineId')
  async updateDiscipline(@Param('disciplineId', ParseIntPipe) disciplineId: number, @Body() dto: SaveDisciplineDto) {
    const actor = await this.session.current();
    return this.competitions.updateDiscipline(actor.club.id, disciplineId, actor.user, dto);
  }

  @Delete('disciplines/:disciplineId')
  @HttpCode(204)
  async removeDiscipline(@Param('disciplineId', ParseIntPipe) disciplineId: number) {
    const actor = await this.session.current();
    await this.competitions.removeDiscipline(actor.club.id, disciplineId, actor.user);
  }

  @Post('editions')
  async createEdition(@Body() dto: CreateEditionDto) {
    const actor = await this.session.current();
    return this.competitions.createEdition(actor.club.id, actor.user, dto);
  }

  @Get('editions/:editionId')
  async edition(@Param('editionId', ParseIntPipe) editionId: number) {
    const actor = await this.session.current();
    return this.competitions.edition(actor.club.id, editionId);
  }

  @Patch('editions/:editionId')
  async updateEdition(@Param('editionId', ParseIntPipe) editionId: number, @Body() dto: SaveEditionDto) {
    const actor = await this.session.current();
    return this.competitions.updateEdition(actor.club.id, editionId, actor.user, dto);
  }

  @Delete('editions/:editionId')
  @HttpCode(204)
  async removeEdition(@Param('editionId', ParseIntPipe) editionId: number) {
    const actor = await this.session.current();
    await this.competitions.removeEdition(actor.club.id, editionId, actor.user);
  }

  @Post('editions/:editionId/pre-register')
  async preRegister(@Param('editionId', ParseIntPipe) editionId: number, @Body() dto: PreRegisterDto) {
    const actor = await this.session.current();
    return this.competitions.preRegister(actor.club.id, editionId, actor.user, dto);
  }

  @Post('editions/:editionId/guests')
  async registerGuest(@Param('editionId', ParseIntPipe) editionId: number, @Body() dto: RegisterGuestDto) {
    const actor = await this.session.current();
    return this.competitions.registerGuest(actor.club.id, editionId, actor.user, dto);
  }

  @Post('editions/:editionId/registrations/:registrationId/confirm')
  async confirm(
    @Param('editionId', ParseIntPipe) editionId: number,
    @Param('registrationId', ParseIntPipe) registrationId: number,
  ) {
    const actor = await this.session.current();
    return this.competitions.confirmRegistration(actor.club.id, editionId, registrationId, actor.user);
  }

  @Post('editions/:editionId/registrations/:registrationId/cancel')
  async cancel(
    @Param('editionId', ParseIntPipe) editionId: number,
    @Param('registrationId', ParseIntPipe) registrationId: number,
  ) {
    const actor = await this.session.current();
    return this.competitions.cancelRegistration(actor.club.id, editionId, registrationId, actor.user);
  }

  @Patch('editions/:editionId/registrations/:registrationId/score')
  async score(
    @Param('editionId', ParseIntPipe) editionId: number,
    @Param('registrationId', ParseIntPipe) registrationId: number,
    @Body() dto: SaveScoreDto,
  ) {
    const actor = await this.session.current();
    return this.competitions.saveScore(actor.club.id, editionId, registrationId, actor.user, dto);
  }

  @Post('editions/:editionId/close')
  async close(@Param('editionId', ParseIntPipe) editionId: number) {
    const actor = await this.session.current();
    return this.competitions.closeEdition(actor.club.id, editionId, actor.user);
  }

  @Post('editions/:editionId/winners')
  async winners(@Param('editionId', ParseIntPipe) editionId: number, @Body() dto: PublishWinnersDto) {
    const actor = await this.session.current();
    return this.competitions.publishWinners(actor.club.id, editionId, actor.user, dto);
  }
}
