import { IsEmail, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class SignUpDto {
  @IsString({ message: 'Escribe el nombre de tu club.' })
  @MinLength(2, { message: 'Escribe el nombre de tu club.' })
  @MaxLength(120, { message: 'El nombre del club es demasiado largo.' })
  club: string;

  @IsString({ message: 'Escribe tu nombre.' })
  @MinLength(2, { message: 'Escribe tu nombre.' })
  @MaxLength(120, { message: 'El nombre es demasiado largo.' })
  nombre: string;

  @IsEmail({}, { message: 'Escribe un correo válido.' })
  @MaxLength(160, { message: 'El correo es demasiado largo.' })
  correo: string;

  @IsString({ message: 'Escribe tu teléfono.' })
  @MinLength(10, { message: 'Escribe un teléfono de 10 dígitos.' })
  @MaxLength(20, { message: 'El teléfono es demasiado largo.' })
  telefono: string;

  @IsString({ message: 'Escribe tu contraseña.' })
  @MinLength(6, { message: 'La contraseña debe tener al menos 6 caracteres.' })
  @MaxLength(72, { message: 'La contraseña es demasiado larga.' })
  password: string;

  @IsString({ message: 'Escribe el código de invitación.' })
  @Matches(/^[A-Za-z0-9]{4}-[A-Za-z0-9]{4}-[A-Za-z0-9]{4}-[A-Za-z0-9]{4}$/, {
    message: 'El código de invitación no es válido.',
  })
  codigoInvitacion: string;
}
