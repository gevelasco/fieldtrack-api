import { IsBoolean, IsIn, IsOptional, IsString, Matches, MaxLength, ValidateIf } from 'class-validator';
import { EVENT_CATEGORIES, EVENT_RECURRENCES, EVENT_VISIBILITIES } from '../entities/club-event.entity';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export class ListEventsQueryDto {
  @Matches(DATE, { message: 'La fecha inicial debe tener el formato AAAA-MM-DD.' })
  from: string;

  @Matches(DATE, { message: 'La fecha final debe tener el formato AAAA-MM-DD.' })
  to: string;
}

export class SaveEventDto {
  @IsString()
  @MaxLength(160)
  title: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  description?: string;

  @IsIn(EVENT_VISIBILITIES, { message: 'Elige si el evento es público o privado.' })
  visibility: (typeof EVENT_VISIBILITIES)[number];

  @IsIn(EVENT_CATEGORIES, { message: 'Elige la categoría del evento.' })
  category: (typeof EVENT_CATEGORIES)[number];

  @Matches(DATE, { message: 'La fecha debe tener el formato AAAA-MM-DD.' })
  startsOn: string;

  @IsOptional()
  @IsBoolean()
  allDay?: boolean;

  @ValidateIf((dto: SaveEventDto) => !dto.allDay)
  @Matches(TIME, { message: 'La hora debe tener el formato HH:MM.' })
  startTime?: string | null;

  @IsOptional()
  @ValidateIf((dto: SaveEventDto) => !dto.allDay && dto.endTime !== null)
  @Matches(TIME, { message: 'La hora de término debe tener el formato HH:MM.' })
  endTime?: string | null;

  @IsIn(EVENT_RECURRENCES, { message: 'Elige cómo se repite el evento.' })
  recurrence: (typeof EVENT_RECURRENCES)[number];

  @IsOptional()
  @ValidateIf((dto: SaveEventDto) => dto.repeatUntil !== null)
  @Matches(DATE, { message: 'La fecha de fin debe tener el formato AAAA-MM-DD.' })
  repeatUntil?: string | null;
}
