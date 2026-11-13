import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { FIELDTRACK_SCHEMA } from '../../common/constants/schema-name';
import { AppUser } from '../../users/entities/app-user.entity';
import { ClubRequest } from './club-request.entity';

@Entity({ schema: FIELDTRACK_SCHEMA, name: 'club_request_documents' })
export class ClubRequestDocument {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'club_id', type: 'int' })
  clubId: number;

  @Column({ name: 'request_id', type: 'int' })
  requestId: number;

  @ManyToOne(() => ClubRequest, (request) => request.documents, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'request_id' })
  request: ClubRequest;

  @Column({ name: 'file_name', type: 'text' })
  fileName: string;

  @Column({ name: 'content_type', type: 'text' })
  contentType: string;

  @Column({ name: 'size_bytes', type: 'bigint' })
  sizeBytes: string;

  @Column({ name: 'storage_key', type: 'text', nullable: true })
  storageKey: string | null;

  @Column({ type: 'bytea', nullable: true, select: false })
  content: Buffer | null;

  @Column({ name: 'uploaded_by_user_id', type: 'int' })
  uploadedByUserId: number;

  @ManyToOne(() => AppUser)
  @JoinColumn({ name: 'uploaded_by_user_id' })
  uploadedBy: AppUser;

  @Column({ name: 'uploaded_at', type: 'timestamptz', default: () => 'now()' })
  uploadedAt: Date;

  /** Documento del expediente al que corresponde este archivo. */
  @Column({ name: 'item_slot', type: 'text', nullable: true })
  itemSlot: string | null;

  /** Arma cuya hoja de registro es este archivo. */
  @Column({ name: 'item_weapon_id', type: 'int', nullable: true })
  itemWeaponId: number | null;

  /** Solo en archivos ligados a un elemento pedido. */
  @Column({ name: 'review_status', type: 'text', nullable: true })
  reviewStatus: RequestItemReview | null;

  @Column({ name: 'review_note', type: 'text', nullable: true })
  reviewNote: string | null;

  @Column({ name: 'reviewed_at', type: 'timestamptz', nullable: true })
  reviewedAt: Date | null;

  @Column({ name: 'reviewed_by_user_id', type: 'int', nullable: true })
  reviewedByUserId: number | null;

  @ManyToOne(() => AppUser)
  @JoinColumn({ name: 'reviewed_by_user_id' })
  reviewedBy: AppUser | null;
}

export type RequestItemReview = 'pending' | 'approved' | 'rejected';
