import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { MembersImportService } from '../members/members-import.service';
import { SessionService } from '../session/session.service';
import { CreateClubStaffDto, UpdateClubStaffDto } from './dto/create-club-staff.dto';
import { UpdateClubSettingsDto } from './dto/update-club-settings.dto';
import { ClubSettingsService } from './club-settings.service';
import { ClubStaffService } from './club-staff.service';
import { normalizeStaffModulePermissions, requireStaffModule } from './staff-module-permissions';

@ApiTags('club')
@Controller('club')
export class ClubSettingsController {
  constructor(
    private readonly settings: ClubSettingsService,
    private readonly staff: ClubStaffService,
    private readonly session: SessionService,
    private readonly memberImport: MembersImportService,
  ) {}

  @Get('settings')
  @ApiOperation({ summary: 'Configuración del club (administrador)' })
  async read() {
    const actor = await this.session.current();
    requireStaffModule(
      actor.user.role,
      normalizeStaffModulePermissions(actor.user.modulePermissions),
      'configuracion',
      'view',
    );
    return this.settings.read(actor.club.id);
  }

  @Patch('settings')
  @ApiOperation({ summary: 'Actualizar identidad, anualidades y documentos del club' })
  async update(@Body() dto: UpdateClubSettingsDto) {
    const actor = await this.session.current();
    return this.settings.update(actor.club.id, actor.user, dto);
  }

  @Post('staff')
  @ApiOperation({ summary: 'Alta de usuario staff del club' })
  async createStaff(@Body() dto: CreateClubStaffDto) {
    const actor = await this.session.current();
    requireStaffModule(
      actor.user.role,
      normalizeStaffModulePermissions(actor.user.modulePermissions),
      'configuracion',
      'write',
    );
    await this.staff.create(actor.club.id, actor.user, dto);
    return this.settings.read(actor.club.id);
  }

  @Patch('staff/:id')
  @ApiOperation({ summary: 'Actualizar usuario staff' })
  async updateStaff(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateClubStaffDto) {
    const actor = await this.session.current();
    requireStaffModule(
      actor.user.role,
      normalizeStaffModulePermissions(actor.user.modulePermissions),
      'configuracion',
      'write',
    );
    await this.staff.update(actor.club.id, actor.user, id, dto);
    return this.settings.read(actor.club.id);
  }

  @Get('import/members/template')
  @ApiOperation({ summary: 'Plantilla Excel para importar socios' })
  async memberImportTemplate() {
    const actor = await this.session.current();
    requireStaffModule(
      actor.user.role,
      normalizeStaffModulePermissions(actor.user.modulePermissions),
      'configuracion',
      'view',
    );
    const buffer = await this.memberImport.buildMembersTemplate(actor.club.id);
    return new StreamableFile(buffer, {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      disposition: 'attachment; filename="fieldtrack-socios-plantilla.xlsx"',
    });
  }

  @Get('import/weapons/template')
  @ApiOperation({ summary: 'Plantilla Excel para importar armas' })
  async weaponsImportTemplate() {
    const actor = await this.session.current();
    requireStaffModule(
      actor.user.role,
      normalizeStaffModulePermissions(actor.user.modulePermissions),
      'configuracion',
      'view',
    );
    const buffer = this.memberImport.buildWeaponsTemplate();
    return new StreamableFile(buffer, {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      disposition: 'attachment; filename="fieldtrack-armas-plantilla.xlsx"',
    });
  }

  @Post('import/members')
  @ApiOperation({ summary: 'Importar socios desde Excel' })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 15 * 1024 * 1024 } }))
  async importMembers(@UploadedFile() file?: { buffer: Buffer }) {
    const actor = await this.session.current();
    requireStaffModule(
      actor.user.role,
      normalizeStaffModulePermissions(actor.user.modulePermissions),
      'configuracion',
      'write',
    );
    return this.memberImport.importMembersFile(actor.club.id, actor.user, file?.buffer ?? Buffer.alloc(0));
  }

  @Post('import/weapons')
  @ApiOperation({ summary: 'Importar armas desde Excel' })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 15 * 1024 * 1024 } }))
  async importWeapons(@UploadedFile() file?: { buffer: Buffer }) {
    const actor = await this.session.current();
    requireStaffModule(
      actor.user.role,
      normalizeStaffModulePermissions(actor.user.modulePermissions),
      'configuracion',
      'write',
    );
    return this.memberImport.importWeaponsFile(actor.club.id, actor.user, file?.buffer ?? Buffer.alloc(0));
  }

  @Delete('staff/:id')
  @ApiOperation({ summary: 'Dar de baja usuario staff' })
  async deactivateStaff(@Param('id', ParseIntPipe) id: number) {
    const actor = await this.session.current();
    requireStaffModule(
      actor.user.role,
      normalizeStaffModulePermissions(actor.user.modulePermissions),
      'configuracion',
      'write',
    );
    await this.staff.deactivate(actor.club.id, actor.user, id);
    return this.settings.read(actor.club.id);
  }
}
