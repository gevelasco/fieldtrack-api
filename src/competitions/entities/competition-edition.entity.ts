import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { FIELDTRACK_SCHEMA } from '../../common/constants/schema-name';
import { CompetitionDiscipline } from './competition-discipline.entity';
import { CompetitionRegistration } from './competition-registration.entity';

@Entity({ schema: FIELDTRACK_SCHEMA, name: 'competition_editions' })
export class CompetitionEdition {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'club_id', type: 'int' })
  clubId: number;

  @Column({ name: 'discipline_id', type: 'int' })
  disciplineId: number;

  @ManyToOne(() => CompetitionDiscipline, (discipline) => discipline.editions, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'discipline_id' })
  discipline?: CompetitionDiscipline;

  @Column({ type: 'text' })
  title: string;

  @Column({ type: 'text', default: '' })
  venue: string;

  @Column({ name: 'starts_on', type: 'date' })
  startsOn: string;

  @Column({ name: 'ends_on', type: 'date' })
  endsOn: string;

  @Column({ name: 'start_time', type: 'time', nullable: true })
  startTime: string | null;

  @Column({ name: 'end_time', type: 'time', nullable: true })
  endTime: string | null;

  @Column({ name: 'max_participants', type: 'int', nullable: true })
  maxParticipants: number | null;

  @Column({ name: 'entry_fee', type: 'numeric', precision: 12, scale: 2, default: 0 })
  entryFee: string;

  @Column({ name: 'registration_opens', type: 'timestamptz' })
  registrationOpens: Date;

  @Column({ name: 'registration_closes', type: 'timestamptz' })
  registrationCloses: Date;

  @Column({ name: 'payment_deadline', type: 'timestamptz' })
  paymentDeadline: Date;

  @Column({ type: 'text', default: '' })
  notes: string;

  /** null = abierto sin requisito mínimo (sporting/compak: Iniciados, C, B, A). */
  @Column({ name: 'minimum_level', type: 'text', nullable: true })
  minimumLevel: 'iniciados' | 'c' | 'b' | 'a' | null;

  @Column({ name: 'closed_at', type: 'timestamptz', nullable: true })
  closedAt: Date | null;

  @Column({ name: 'created_by_user_id', type: 'int' })
  createdByUserId: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @OneToMany(() => CompetitionRegistration, (registration) => registration.edition)
  registrations?: CompetitionRegistration[];
}
