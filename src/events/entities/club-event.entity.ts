import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { FIELDTRACK_SCHEMA } from '../../common/constants/schema-name';
import { AppUser } from '../../users/entities/app-user.entity';

export const EVENT_VISIBILITIES = ['public', 'private'] as const;
export type EventVisibility = (typeof EVENT_VISIBILITIES)[number];

/** `outing` son las salidas de campo (caza y pesca); `event` agrupa lo social y lo que no encaja en otra. */
export const EVENT_CATEGORIES = [
  'assembly',
  'competition',
  'practice',
  'course',
  'outing',
  'maintenance',
  'event',
] as const;
export type EventCategory = (typeof EVENT_CATEGORIES)[number] | 'hunting_season';

/**
 * Se calcula a partir de `startsOn`: `weekly` repite el día de la semana, `monthly_day` el día del mes,
 * `monthly_weekday` el n-ésimo día de la semana (p. ej. primer viernes) y `monthly_last_weekday` el último.
 */
export const EVENT_RECURRENCES = [
  'none',
  'weekly',
  'monthly_day',
  'monthly_weekday',
  'monthly_last_weekday',
  'yearly',
] as const;
export type EventRecurrence = (typeof EVENT_RECURRENCES)[number];

@Entity({ schema: FIELDTRACK_SCHEMA, name: 'club_events' })
export class ClubEvent {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'club_id', type: 'int' })
  clubId: number;

  @Column({ type: 'text' })
  title: string;

  @Column({ type: 'text', default: '' })
  description: string;

  @Column({ type: 'text' })
  visibility: EventVisibility;

  @Column({ type: 'text', default: 'event' })
  category: EventCategory;

  /** Fecha del evento, o de la primera vez si se repite. */
  @Column({ name: 'starts_on', type: 'date' })
  startsOn: string;

  /** Vacía en los eventos de todo el día. */
  @Column({ name: 'start_time', type: 'time', nullable: true })
  startTime: string | null;

  @Column({ name: 'end_time', type: 'time', nullable: true })
  endTime: string | null;

  @Column({ type: 'text', default: 'none' })
  recurrence: EventRecurrence;

  @Column({ name: 'repeat_until', type: 'date', nullable: true })
  repeatUntil: string | null;

  /** Último día de un evento que abarca varios días; solo existe si no se repite. */
  @Column({ name: 'ends_on', type: 'date', nullable: true })
  endsOn: string | null;

  /** Las temporadas de caza crean su propio evento y solo se editan desde Cinegética. */
  @Column({ name: 'hunting_season_id', type: 'int', nullable: true })
  huntingSeasonId: number | null;

  @Column({ name: 'competition_edition_id', type: 'int', nullable: true })
  competitionEditionId: number | null;

  @Column({ name: 'created_by_user_id', type: 'int' })
  createdByUserId: number;

  @ManyToOne(() => AppUser)
  @JoinColumn({ name: 'created_by_user_id' })
  createdBy: AppUser;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @Column({ name: 'removed_at', type: 'timestamptz', nullable: true })
  removedAt: Date | null;

  @Column({ name: 'removed_by_user_id', type: 'int', nullable: true })
  removedByUserId: number | null;
}
