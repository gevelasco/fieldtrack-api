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
import { Member } from '../../members/entities/member.entity';
import { AppUser } from '../../users/entities/app-user.entity';
import { CompetitionEdition } from './competition-edition.entity';

export type CompetitionParticipantKind = 'member' | 'guest';
export type CompetitionRegistrationStatus = 'pre_registered' | 'confirmed' | 'expired' | 'cancelled';

@Entity({ schema: FIELDTRACK_SCHEMA, name: 'competition_registrations' })
export class CompetitionRegistration {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'club_id', type: 'int' })
  clubId: number;

  @Column({ name: 'edition_id', type: 'int' })
  editionId: number;

  @ManyToOne(() => CompetitionEdition, (edition) => edition.registrations, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'edition_id' })
  edition?: CompetitionEdition;

  @Column({ name: 'participant_kind', type: 'text' })
  participantKind: CompetitionParticipantKind;

  @Column({ name: 'member_id', type: 'int', nullable: true })
  memberId: number | null;

  @ManyToOne(() => Member, (member) => member.competitionRegistrations)
  @JoinColumn({ name: 'member_id' })
  member?: Member | null;

  @Column({ name: 'guest_name', type: 'text', nullable: true })
  guestName: string | null;

  @Column({ name: 'guest_phone', type: 'text', nullable: true })
  guestPhone: string | null;

  @Column({ type: 'text' })
  status: CompetitionRegistrationStatus;

  @Column({ name: 'pre_registered_at', type: 'timestamptz' })
  preRegisteredAt: Date;

  @Column({ name: 'confirmed_at', type: 'timestamptz', nullable: true })
  confirmedAt: Date | null;

  @Column({ name: 'confirmed_by_user_id', type: 'int', nullable: true })
  confirmedByUserId: number | null;

  @ManyToOne(() => AppUser)
  @JoinColumn({ name: 'confirmed_by_user_id' })
  confirmedBy?: AppUser | null;

  @Column({ type: 'numeric', precision: 10, scale: 2, nullable: true })
  score: string | null;

  @Column({ type: 'int', nullable: true })
  rank: number | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
