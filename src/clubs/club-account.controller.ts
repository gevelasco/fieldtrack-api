import { Body, Controller, Get, Patch, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { SessionService } from '../session/session.service';
import { ClubAccountService } from './club-account.service';
import { RedeemClubCouponDto } from './dto/redeem-club-coupon.dto';
import { UpdateClubAccountDto } from './dto/update-club-account.dto';

@ApiTags('club')
@Controller('club/account')
export class ClubAccountController {
  constructor(
    private readonly account: ClubAccountService,
    private readonly session: SessionService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Cuenta del club (administrador)' })
  async read() {
    const actor = await this.session.current();
    return this.account.read(actor.club.id, actor.user);
  }

  @Patch()
  @ApiOperation({ summary: 'Actualizar identidad del club desde Cuenta' })
  async update(@Body() dto: UpdateClubAccountDto) {
    const actor = await this.session.current();
    return this.account.updateIdentity(actor.club.id, actor.user, dto);
  }

  @Post('redeem-coupon')
  @ApiOperation({ summary: 'Canjear cupón de un mes gratis' })
  async redeemCoupon(@Body() dto: RedeemClubCouponDto) {
    const actor = await this.session.current();
    return this.account.redeemCoupon(actor.club.id, actor.user, dto);
  }
}
