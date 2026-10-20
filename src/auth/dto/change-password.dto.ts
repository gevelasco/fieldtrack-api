import { IsString, MaxLength, MinLength } from 'class-validator';

export class ChangePasswordDto {
  @IsString({ message: 'Escribe tu contraseña actual.' })
  @MinLength(6, { message: 'La contraseña actual debe tener al menos 6 caracteres.' })
  @MaxLength(72, { message: 'La contraseña es demasiado larga.' })
  currentPassword: string;

  @IsString({ message: 'Escribe la nueva contraseña.' })
  @MinLength(6, { message: 'La nueva contraseña debe tener al menos 6 caracteres.' })
  @MaxLength(72, { message: 'La contraseña es demasiado larga.' })
  password: string;
}
