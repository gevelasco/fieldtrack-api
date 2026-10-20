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
import { Member } from '../../members/entities/member.entity';
import { AppUser } from '../../users/entities/app-user.entity';
import { ClubRequestComment } from './club-request-comment.entity';
import { ClubRequestDocument } from './club-request-document.entity';
import { ClubRequestEvent } from './club-request-event.entity';

export type RequestKind = 'member' | 'internal';
export type RequestStatus = 'new' | 'in_progress' | 'completed';
/** `member_documents`: documentos que faltan; `document_renewal`: un documento ya cargado que debe renovarse. */
export type RequestTopic = 'general' | 'member_documents' | 'document_renewal';

@Entity({ schema: FIELDTRACK_SCHEMA, name: 'club_requests' })
export class ClubRequest {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'club_id', type: 'int' })
  clubId: number;

  /** Consecutivo por club; el código visible es `SOL-0001`. */
  @Column({ type: 'int' })
  number: number;

  @Column({ type: 'text' })
  kind: RequestKind;

  @Column({ name: 'member_id', type: 'int', nullable: true })
  memberId: number | null;

  @ManyToOne(() => Member, { nullable: true })
  @JoinColumn({ name: 'member_id' })
  member: Member | null;

  @Column({ type: 'text' })
  title: string;

  @Column({ type: 'text', default: '' })
  description: string;

  @Column({ type: 'text', default: 'new' })
  status: RequestStatus;

  @Column({ type: 'text', default: 'general' })
  topic: RequestTopic;

  /** Expediente del socio que se le pidió subir. */
  @Column({ name: 'document_slots', type: 'text', array: true, default: () => "'{}'" })
  documentSlots: string[];

  @Column({ name: 'created_by_user_id', type: 'int' })
  createdByUserId: number;

  @ManyToOne(() => AppUser)
  @JoinColumn({ name: 'created_by_user_id' })
  createdBy: AppUser;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @Column({ name: 'started_at', type: 'timestamptz', nullable: true })
  startedAt: Date | null;

  @Column({ name: 'started_by_user_id', type: 'int', nullable: true })
  startedByUserId: number | null;

  @ManyToOne(() => AppUser, { nullable: true })
  @JoinColumn({ name: 'started_by_user_id' })
  startedBy: AppUser | null;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt: Date | null;

  @Column({ name: 'completed_by_user_id', type: 'int', nullable: true })
  completedByUserId: number | null;

  @ManyToOne(() => AppUser, { nullable: true })
  @JoinColumn({ name: 'completed_by_user_id' })
  completedBy: AppUser | null;

  @Column({ name: 'removed_at', type: 'timestamptz', nullable: true })
  removedAt: Date | null;

  @Column({ name: 'removed_by_user_id', type: 'int', nullable: true })
  removedByUserId: number | null;

  @OneToMany(() => ClubRequestDocument, (document) => document.request)
  documents: ClubRequestDocument[];

  @OneToMany(() => ClubRequestEvent, (event) => event.request)
  events: ClubRequestEvent[];

  @OneToMany(() => ClubRequestComment, (comment) => comment.request)
  comments: ClubRequestComment[];
}
