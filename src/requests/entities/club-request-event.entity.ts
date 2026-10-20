import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { FIELDTRACK_SCHEMA } from '../../common/constants/schema-name';
import { AppUser } from '../../users/entities/app-user.entity';
import { ClubRequest } from './club-request.entity';

export type RequestEventKind =
  | 'created'
  | 'updated'
  | 'started'
  | 'returned'
  | 'completed'
  | 'reopened'
  | 'document_added'
  | 'document_removed'
  | 'removed'
  | 'member_submitted'
  | 'comment_added';

@Entity({ schema: FIELDTRACK_SCHEMA, name: 'club_request_events' })
export class ClubRequestEvent {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'club_id', type: 'int' })
  clubId: number;

  @Column({ name: 'request_id', type: 'int' })
  requestId: number;

  @ManyToOne(() => ClubRequest, (request) => request.events, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'request_id' })
  request: ClubRequest;

  @Column({ type: 'text' })
  kind: RequestEventKind;

  @Column({ type: 'text' })
  detail: string;

  @Column({ name: 'actor_user_id', type: 'int' })
  actorUserId: number;

  @ManyToOne(() => AppUser)
  @JoinColumn({ name: 'actor_user_id' })
  actor: AppUser;

  @Column({ name: 'occurred_at', type: 'timestamptz', default: () => 'now()' })
  occurredAt: Date;
}
