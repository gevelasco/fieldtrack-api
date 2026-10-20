import { IsString, MinLength } from 'class-validator';

export class RefreshTokenDto {
  @IsString({ message: 'Falta el token de renovación.' })
  @MinLength(10, { message: 'El token de renovación no es válido.' })
  refreshToken: string;
}
