import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  StreamableFile,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SessionService } from '../session/session.service';
import {
  ChangeRequestStatusDto,
  CreateRequestDto,
  ListRequestsQueryDto,
  MemberCreateRequestDto,
  MemberSubmitRequestDto,
  RequestCommentDto,
  RequestFileDto,
  SaveRequestDto,
} from './dto/request.dto';
import { RequestsService } from './requests.service';

@ApiTags('requests')
@Controller('requests')
export class RequestsController {
  constructor(
    private readonly requests: RequestsService,
    private readonly session: SessionService,
  ) {}

  @Get()
  async list(@Query() query: ListRequestsQueryDto) {
    const actor = await this.session.current();
    return this.requests.list(actor.club.id, actor.user, query);
  }

  @Get('summary')
  async summary() {
    const actor = await this.session.current();
    return this.requests.summary(actor.club.id, actor.user);
  }

  @Get(':requestId')
  async detail(@Param('requestId', ParseIntPipe) requestId: number) {
    const actor = await this.session.current();
    return this.requests.detail(actor.club.id, requestId, actor.user);
  }

  @Post()
  async create(@Body() dto: CreateRequestDto) {
    const actor = await this.session.current();
    return this.requests.create(actor.club.id, actor.user, dto);
  }

  @Post('member')
  async createByMember(@Body() dto: MemberCreateRequestDto) {
    const actor = await this.session.current();
    return this.requests.createByMember(actor.club.id, actor.user, dto);
  }

  @Patch(':requestId')
  async update(
    @Param('requestId', ParseIntPipe) requestId: number,
    @Body() dto: SaveRequestDto,
  ) {
    const actor = await this.session.current();
    return this.requests.update(actor.club.id, requestId, actor.user, dto);
  }

  @Post(':requestId/status')
  async status(
    @Param('requestId', ParseIntPipe) requestId: number,
    @Body() dto: ChangeRequestStatusDto,
  ) {
    const actor = await this.session.current();
    return this.requests.changeStatus(actor.club.id, requestId, actor.user, dto);
  }

  @Post(':requestId/documents')
  async addDocument(
    @Param('requestId', ParseIntPipe) requestId: number,
    @Body() dto: RequestFileDto,
  ) {
    const actor = await this.session.current();
    return this.requests.addDocument(actor.club.id, requestId, actor.user, dto);
  }

  @Post(':requestId/comments')
  async addComment(
    @Param('requestId', ParseIntPipe) requestId: number,
    @Body() dto: RequestCommentDto,
  ) {
    const actor = await this.session.current();
    return this.requests.addComment(actor.club.id, requestId, actor.user, dto);
  }

  @Post(':requestId/submit')
  async memberSubmit(
    @Param('requestId', ParseIntPipe) requestId: number,
    @Body() dto: MemberSubmitRequestDto,
  ) {
    const actor = await this.session.current();
    return this.requests.memberSubmit(actor.club.id, requestId, actor.user, dto);
  }

  @Delete(':requestId/documents/:documentId')
  async removeDocument(
    @Param('requestId', ParseIntPipe) requestId: number,
    @Param('documentId', ParseIntPipe) documentId: number,
  ) {
    const actor = await this.session.current();
    return this.requests.removeDocument(actor.club.id, requestId, documentId, actor.user);
  }

  @Get(':requestId/documents/:documentId/file')
  async documentFile(
    @Param('requestId', ParseIntPipe) requestId: number,
    @Param('documentId', ParseIntPipe) documentId: number,
  ) {
    const actor = await this.session.current();
    const file = await this.requests.readDocument(actor.club.id, requestId, documentId, actor.user);
    return new StreamableFile(file.content, {
      type: file.contentType,
      disposition: `attachment; filename="${encodeURIComponent(file.fileName)}"`,
    });
  }

  @Delete(':requestId')
  @HttpCode(204)
  async remove(@Param('requestId', ParseIntPipe) requestId: number) {
    const actor = await this.session.current();
    await this.requests.remove(actor.club.id, requestId, actor.user);
  }
}
