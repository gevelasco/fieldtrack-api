import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  Query,
  StreamableFile,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { assertStaffModuleAccess } from '../clubs/staff-access';
import { RequestsService } from '../requests/requests.service';
import { SessionService } from '../session/session.service';
import {
  CreateMemberDto,
  ListMembersQueryDto,
  RecordPaymentDto,
  ReplacePetasDto,
  ReplaceWeaponsDto,
  RequestMemberDocumentsDto,
  ResetMemberPasswordDto,
  UpdateMemberDto,
} from './dto/member.dto';
import { MembersService } from './members.service';

@ApiTags('members')
@Controller('members')
export class MembersController {
  constructor(
    private readonly members: MembersService,
    private readonly requests: RequestsService,
    private readonly session: SessionService,
  ) {}

  @Get()
  async list(@Query() query: ListMembersQueryDto) {
    const actor = await this.session.current();
    assertStaffModuleAccess(actor.user, 'members', 'view');
    return this.members.search(actor.club.id, query);
  }

  @Get('summary')
  async summary() {
    const actor = await this.session.current();
    assertStaffModuleAccess(actor.user, 'members', 'view');
    return this.members.summary(actor.club.id);
  }

  @Get('numbers')
  async numbers() {
    const actor = await this.session.current();
    assertStaffModuleAccess(actor.user, 'members', 'view');
    return this.members.numbers(actor.club.id);
  }

  @Get('self')
  async self() {
    const actor = await this.session.current();
    if (actor.user.role !== 'socio') {
      throw new ForbiddenException('Solo los socios pueden consultar su expediente.');
    }
    return this.members.findByUserId(actor.club.id, actor.user.id);
  }

  @Post()
  async create(@Body() dto: CreateMemberDto) {
    const actor = await this.session.current();
    assertStaffModuleAccess(actor.user, 'members', 'write');
    return this.members.create(actor.club.id, actor.user, dto);
  }

  @Get(':memberId')
  async one(@Param('memberId', ParseIntPipe) memberId: number) {
    const actor = await this.session.current();
    assertStaffModuleAccess(actor.user, 'members', 'view');
    return this.members.findOne(actor.club.id, memberId);
  }

  @Get(':memberId/documents/:slot/file')
  async documentFile(
    @Param('memberId', ParseIntPipe) memberId: number,
    @Param('slot') slot: string,
  ) {
    const actor = await this.session.current();
    await this.members.assertMemberReadable(actor, memberId);
    return this.stream(await this.members.readDocument(actor.club.id, memberId, slot));
  }

  @Get(':memberId/weapons/:weaponId/sheet')
  async weaponSheet(
    @Param('memberId', ParseIntPipe) memberId: number,
    @Param('weaponId', ParseIntPipe) weaponId: number,
  ) {
    const actor = await this.session.current();
    await this.members.assertMemberReadable(actor, memberId);
    return this.stream(await this.members.readSheet(actor.club.id, memberId, weaponId));
  }

  @Get(':memberId/petas/files/:petaId')
  async petaFileById(
    @Param('memberId', ParseIntPipe) memberId: number,
    @Param('petaId', ParseIntPipe) petaId: number,
  ) {
    const actor = await this.session.current();
    await this.members.assertMemberReadable(actor, memberId);
    return this.stream(
      await this.members.readPetaById(actor.club.id, memberId, petaId, actor.user),
    );
  }

  @Get(':memberId/petas/:permitType/file')
  async petaFile(
    @Param('memberId', ParseIntPipe) memberId: number,
    @Param('permitType') permitType: string,
  ) {
    const actor = await this.session.current();
    await this.members.assertMemberReadable(actor, memberId);
    return this.stream(await this.members.readPeta(actor.club.id, memberId, permitType));
  }

  @Patch(':memberId')
  async update(
    @Param('memberId', ParseIntPipe) memberId: number,
    @Body() dto: UpdateMemberDto,
  ) {
    const actor = await this.session.current();
    assertStaffModuleAccess(actor.user, 'members', 'write');
    return this.members.updateProfile(actor.club.id, memberId, actor.user, dto);
  }

  @Put(':memberId/weapons')
  async weapons(
    @Param('memberId', ParseIntPipe) memberId: number,
    @Body() dto: ReplaceWeaponsDto,
  ) {
    const actor = await this.session.current();
    assertStaffModuleAccess(actor.user, 'members', 'write');
    return this.members.replaceWeapons(actor.club.id, memberId, actor.user, dto);
  }

  @Put(':memberId/petas')
  async petas(
    @Param('memberId', ParseIntPipe) memberId: number,
    @Body() dto: ReplacePetasDto,
  ) {
    const actor = await this.session.current();
    assertStaffModuleAccess(actor.user, 'members', 'write');
    return this.members.replacePetas(actor.club.id, memberId, actor.user, dto);
  }

  @Post(':memberId/payments')
  async pay(
    @Param('memberId', ParseIntPipe) memberId: number,
    @Body() dto: RecordPaymentDto,
  ) {
    const actor = await this.session.current();
    assertStaffModuleAccess(actor.user, 'members', 'write');
    return this.members.recordPayment(actor.club.id, memberId, actor.user, dto);
  }

  @Post(':memberId/payments/:paymentId/revert')
  async revertPayment(
    @Param('memberId', ParseIntPipe) memberId: number,
    @Param('paymentId', ParseIntPipe) paymentId: number,
  ) {
    const actor = await this.session.current();
    assertStaffModuleAccess(actor.user, 'members', 'write');
    return this.members.revertPayment(actor.club.id, memberId, paymentId, actor.user);
  }

  @Post(':memberId/document-requests')
  async requestDocuments(
    @Param('memberId', ParseIntPipe) memberId: number,
    @Body() dto: RequestMemberDocumentsDto,
  ) {
    const actor = await this.session.current();
    assertStaffModuleAccess(actor.user, 'members', 'write');
    const request = await this.requests.requestMemberDocuments(actor.club.id, memberId, actor.user, dto.slot);
    const member = await this.members.findOne(actor.club.id, memberId);
    return { request: { id: request.id, code: request.code, title: request.title }, member };
  }

  @Post(':memberId/password')
  async password(
    @Param('memberId', ParseIntPipe) memberId: number,
    @Body() dto: ResetMemberPasswordDto,
  ) {
    const actor = await this.session.current();
    assertStaffModuleAccess(actor.user, 'members', 'write');
    await this.members.resetPassword(actor.club.id, memberId, actor.user, dto);
  }

  private stream(file: { fileName: string; contentType: string; content: Buffer }) {
    return new StreamableFile(file.content, {
      type: file.contentType,
      disposition: `attachment; filename="${encodeURIComponent(file.fileName)}"`,
    });
  }
}
