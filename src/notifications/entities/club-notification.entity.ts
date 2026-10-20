import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { FIELDTRACK_SCHEMA } from '../../common/constants/schema-name';
import { Club } from '../../clubs/entities/club.entity';
import { AppUser } from '../../users/entities/app-user.entity';

@Entity({ schema: FIELDTRACK_SCHEMA, name: 'club_notifications' })
export class ClubNotification {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'club_id', type: 'int' })
  clubId: number;

  @ManyToOne(() => Club, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'club_id' })
  club: Club;

  @Column({ type: 'text' })
  kind: string;

  @Column({ type: 'text' })
  category: string;

  @Column({ type: 'text' })
  title: string;

  @Column({ type: 'text' })
  detail: string;

  @Column({ name: 'entity_type', type: 'text', nullable: true })
  entityType: string | null;

  @Column({ name: 'entity_id', type: 'text', nullable: true })
  entityId: string | null;

  @Column({ name: 'actor_user_id', type: 'int', nullable: true })
  actorUserId: number | null;

  @ManyToOne(() => AppUser)
  @JoinColumn({ name: 'actor_user_id' })
  actor: AppUser | null;

  @Column({ name: 'actor_label', type: 'text', default: 'Sistema' })
  actorLabel: string;

  @Column({ name: 'occurred_at', type: 'timestamptz' })
  occurredAt: Date;

  @Column({ name: 'dedupe_key', type: 'text', nullable: true })
  dedupeKey: string | null;
}
