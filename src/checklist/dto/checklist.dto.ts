import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateChecklistItemDto {
  @IsString({ message: 'Escribe la tarea.' })
  @MaxLength(200, { message: 'La tarea es demasiado larga.' })
  title: string;
}

export class UpdateChecklistItemDto {
  @IsOptional()
  @IsString({ message: 'Escribe la tarea.' })
  @MaxLength(200, { message: 'La tarea es demasiado larga.' })
  title?: string;

  @IsOptional()
  @IsBoolean({ message: 'Indica si la tarea está hecha.' })
  done?: boolean;
}
