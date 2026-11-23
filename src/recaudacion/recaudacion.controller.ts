import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { assertStaffModuleAccess } from '../clubs/staff-access';
import { SessionService } from '../session/session.service';
import { CreateClubExpenseDto } from './dto/create-club-expense.dto';
import { ListRecaudacionQueryDto } from './dto/list-recaudacion.dto';
import { RecaudacionService } from './recaudacion.service';

@ApiTags('recaudacion')
@Controller('recaudacion')
export class RecaudacionController {
  constructor(
    private readonly recaudacion: RecaudacionService,
    private readonly session: SessionService,
  ) {}

  @Get('entries')
  async entries(@Query() query: ListRecaudacionQueryDto) {
    const actor = await this.session.current();
    assertStaffModuleAccess(actor.user, 'recaudacion', 'view');
    return this.recaudacion.list(actor.club.id, query);
  }

  @Post('expenses')
  async createExpense(@Body() body: CreateClubExpenseDto) {
    const actor = await this.session.current();
    assertStaffModuleAccess(actor.user, 'recaudacion', 'write');
    return this.recaudacion.createExpense(actor.club.id, actor.user.id, body);
  }
}
