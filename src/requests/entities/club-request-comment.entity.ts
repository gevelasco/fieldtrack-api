import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { FIELDTRACK_SCHEMA } from '../../common/constants/schema-name';
import { AppUser } from '../../users/entities/app-user.entity';
import { ClubRequest } from './club-request.entity';

@Entity({ schema: FIELDTRACK_SCHEMA, name: 'club_request_comments' })
export class ClubRequestComment {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'club_id', type: 'int' })
  clubId: number;

  @Column({ name: 'request_id', type: 'int' })
  requestId: number;

  @ManyToOne(() => ClubRequest, (request) => request.comments, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'request_id' })
  request: ClubRequest;

  @Column({ name: 'author_user_id', type: 'int' })
  authorUserId: number;

  @ManyToOne(() => AppUser)
  @JoinColumn({ name: 'author_user_id' })
  author: AppUser;

  @Column({ type: 'text' })
  body: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
