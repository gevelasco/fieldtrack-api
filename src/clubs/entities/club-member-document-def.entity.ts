import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { FIELDTRACK_SCHEMA } from '../../common/constants/schema-name';
import { Club } from './club.entity';

@Entity({ schema: FIELDTRACK_SCHEMA, name: 'club_member_document_defs' })
export class ClubMemberDocumentDef {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'club_id', type: 'int' })
  clubId: number;

  @ManyToOne(() => Club, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'club_id' })
  club: Club;

  @Column({ type: 'text' })
  slot: string;

  @Column({ type: 'text' })
  label: string;

  @Column({ name: 'sort_order', type: 'smallint', default: 0 })
  sortOrder: number;

  @Column({ name: 'effective_from_year', type: 'smallint', nullable: true })
  effectiveFromYear: number | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
