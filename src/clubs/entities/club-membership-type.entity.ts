import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { FIELDTRACK_SCHEMA } from '../../common/constants/schema-name';
import { Club } from './club.entity';

@Entity({ schema: FIELDTRACK_SCHEMA, name: 'club_membership_types' })
export class ClubMembershipType {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'club_id', type: 'int' })
  clubId: number;

  @ManyToOne(() => Club, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'club_id' })
  club: Club;

  @Column({ type: 'text' })
  code: string;

  @Column({ type: 'text' })
  name: string;

  @Column({ name: 'start_month', type: 'smallint' })
  startMonth: number;

  @Column({ name: 'start_day', type: 'smallint' })
  startDay: number;

  @Column({ name: 'end_month', type: 'smallint' })
  endMonth: number;

  @Column({ name: 'end_day', type: 'smallint' })
  endDay: number;

  @Column({ name: 'fee_mxn', type: 'numeric', precision: 12, scale: 2, default: 0 })
  feeMxn: string;

  @Column({ name: 'sort_order', type: 'smallint', default: 0 })
  sortOrder: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
