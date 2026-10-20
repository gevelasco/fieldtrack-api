import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { FIELDTRACK_SCHEMA } from '../../common/constants/schema-name';
import { Member } from './member.entity';

@Entity({ schema: FIELDTRACK_SCHEMA, name: 'member_petas' })
export class MemberPeta {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'club_id', type: 'int' })
  clubId: number;

  @Column({ name: 'member_id', type: 'int' })
  memberId: number;

  @ManyToOne(() => Member, (member) => member.petas, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'member_id' })
  member: Member;

  @Column({ name: 'permit_type', type: 'text' })
  permitType: string;

  @Column({ name: 'file_name', type: 'text' })
  fileName: string;

  @Column({ name: 'content_type', type: 'text', nullable: true })
  contentType: string | null;

  @Column({ name: 'size_bytes', type: 'bigint', nullable: true })
  sizeBytes: string | null;

  @Column({ type: 'bytea', nullable: true, select: false })
  content: Buffer | null;

  @Column({ name: 'loaded_on', type: 'date' })
  loadedOn: string;

  @Column({ name: 'is_current', type: 'boolean', default: true })
  isCurrent: boolean;

  @Column({ name: 'superseded_on', type: 'date', nullable: true })
  supersededOn: string | null;
}
