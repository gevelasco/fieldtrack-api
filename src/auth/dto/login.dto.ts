import { IsString, MaxLength, MinLength } from 'class-validator';

export class LoginDto {
  @IsString({ message: 'Escribe tu usuario o correo.' })
  @MinLength(2, { message: 'Escribe tu usuario o correo.' })
  @MaxLength(160, { message: 'El usuario es demasiado largo.' })
  usuario: string;

  @IsString({ message: 'Escribe tu contraseña.' })
  @MinLength(6, { message: 'La contraseña debe tener al menos 6 caracteres.' })
  @MaxLength(72, { message: 'La contraseña es demasiado larga.' })
  password: string;
}
