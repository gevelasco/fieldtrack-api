import { IsString, MaxLength, MinLength } from 'class-validator';

export class RedeemClubCouponDto {
  @IsString()
  @MinLength(3)
  @MaxLength(64)
  code: string;
}
