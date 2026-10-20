import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SessionService } from '../session/session.service';
import { AppUser } from '../users/entities/app-user.entity';
import { ChecklistService } from './checklist.service';
import { CreateChecklistItemDto, UpdateChecklistItemDto } from './dto/checklist.dto';

@ApiTags('checklist')
@Controller('checklist')
export class ChecklistController {
  constructor(
    private readonly checklist: ChecklistService,
    private readonly session: SessionService,
  ) {}

  @Get()
  async list() {
    const actor = await this.staffActor();
    return this.checklist.list(actor.club.id, actor.user.id);
  }

  @Post()
  async create(@Body() dto: CreateChecklistItemDto) {
    const actor = await this.staffActor();
    return this.checklist.create(actor.club.id, actor.user.id, dto);
  }

  @Patch(':id')
  async update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateChecklistItemDto) {
    const actor = await this.staffActor();
    return this.checklist.update(actor.club.id, actor.user.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id', ParseIntPipe) id: number) {
    const actor = await this.staffActor();
    await this.checklist.remove(actor.club.id, actor.user.id, id);
  }

  private async staffActor() {
    const actor = await this.session.current();
    assertStaffChecklist(actor.user);
    return actor;
  }
}

function assertStaffChecklist(user: AppUser): void {
  if (user.role !== 'admin' && user.role !== 'staff') {
    throw new ForbiddenException('El checklist es solo para staff y administradores.');
  }
}
