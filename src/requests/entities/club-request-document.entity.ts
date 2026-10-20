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

  @Column({ type: 'bytea', select: false })
  content: Buffer;

  @Column({ name: 'uploaded_by_user_id', type: 'int' })
  uploadedByUserId: number;

  @ManyToOne(() => AppUser)
  @JoinColumn({ name: 'uploaded_by_user_id' })
  uploadedBy: AppUser;

  @Column({ name: 'uploaded_at', type: 'timestamptz', default: () => 'now()' })
  uploadedAt: Date;
}
