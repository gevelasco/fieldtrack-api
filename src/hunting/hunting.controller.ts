import { Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SessionService } from '../session/session.service';
import { CreateSeasonDto, CreateSpeciesDto, SaveSeasonDto, SaveSpeciesDto, SellTagDto } from './dto/hunting.dto';
import { HuntingService } from './hunting.service';

@ApiTags('hunting')
@Controller('hunting')
export class HuntingController {
  constructor(
    private readonly hunting: HuntingService,
    private readonly session: SessionService,
  ) {}

  @Get('species')
  async list() {
    const actor = await this.session.current();
    return this.hunting.list(actor.club.id);
  }

  @Post('species')
  async createSpecies(@Body() dto: CreateSpeciesDto) {
    const actor = await this.session.current();
    return this.hunting.createSpecies(actor.club.id, actor.user, dto);
  }

  @Patch('species/:speciesId')
  async updateSpecies(@Param('speciesId', ParseIntPipe) speciesId: number, @Body() dto: SaveSpeciesDto) {
    const actor = await this.session.current();
    return this.hunting.updateSpecies(actor.club.id, speciesId, actor.user, dto);
  }

  @Delete('species/:speciesId')
  @HttpCode(204)
  async removeSpecies(@Param('speciesId', ParseIntPipe) speciesId: number) {
    const actor = await this.session.current();
    await this.hunting.removeSpecies(actor.club.id, speciesId, actor.user);
  }

  @Get('eligible-members')
  async eligibleMembers(@Query('search') search?: string) {
    const actor = await this.session.current();
    return this.hunting.searchEligibleMembers(actor.club.id, search);
  }

  @Post('seasons')
  async createSeason(@Body() dto: CreateSeasonDto) {
    const actor = await this.session.current();
    return this.hunting.createSeason(actor.club.id, actor.user, dto);
  }

  @Get('seasons/:seasonId')
  async season(@Param('seasonId', ParseIntPipe) seasonId: number) {
    const actor = await this.session.current();
    return this.hunting.season(actor.club.id, seasonId);
  }

  @Patch('seasons/:seasonId')
  async updateSeason(@Param('seasonId', ParseIntPipe) seasonId: number, @Body() dto: SaveSeasonDto) {
    const actor = await this.session.current();
    return this.hunting.updateSeason(actor.club.id, seasonId, actor.user, dto);
  }

  @Delete('seasons/:seasonId')
  @HttpCode(204)
  async removeSeason(@Param('seasonId', ParseIntPipe) seasonId: number) {
    const actor = await this.session.current();
    await this.hunting.removeSeason(actor.club.id, seasonId, actor.user);
  }

  @Post('seasons/:seasonId/sales')
  async sell(@Param('seasonId', ParseIntPipe) seasonId: number, @Body() dto: SellTagDto) {
    const actor = await this.session.current();
    return this.hunting.sellTag(actor.club.id, seasonId, actor.user, dto);
  }

  @Post('seasons/:seasonId/sales/:saleId/revert')
  async revert(
    @Param('seasonId', ParseIntPipe) seasonId: number,
    @Param('saleId', ParseIntPipe) saleId: number,
  ) {
    const actor = await this.session.current();
    return this.hunting.revertSale(actor.club.id, seasonId, saleId, actor.user);
  }
}
