import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { FIELDTRACK_SCHEMA } from '../../common/constants/schema-name';
import { Member } from '../../members/entities/member.entity';
import { AppUser } from '../../users/entities/app-user.entity';
import { HuntingSeason } from './hunting-season.entity';

@Entity({ schema: FIELDTRACK_SCHEMA, name: 'hunting_tag_sales' })
export class HuntingTagSale {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'club_id', type: 'int' })
  clubId: number;

  @Column({ name: 'season_id', type: 'int' })
  seasonId: number;

  @ManyToOne(() => HuntingSeason, (season) => season.sales, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'season_id' })
  season: HuntingSeason;

  @Column({ name: 'member_id', type: 'int' })
  memberId: number;

  @ManyToOne(() => Member, (member) => member.huntingTags, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'member_id' })
  member: Member;

  /** Folio impreso en el cintillo; no se repite entre las ventas vigentes de la temporada. */
  @Column({ type: 'text' })
  folio: string;

  @Column({ name: 'paid_on', type: 'date' })
  paidOn: string;

  @Column({ type: 'numeric', precision: 12, scale: 2 })
  amount: string;

  @Column({ name: 'recorded_by_user_id', type: 'int' })
  recordedByUserId: number;

  @ManyToOne(() => AppUser)
  @JoinColumn({ name: 'recorded_by_user_id' })
  recordedBy: AppUser;

  @Column({ name: 'reverted_at', type: 'timestamptz', nullable: true })
  revertedAt: Date | null;

  @Column({ name: 'reverted_by_user_id', type: 'int', nullable: true })
  revertedByUserId: number | null;

  @ManyToOne(() => AppUser, { nullable: true })
  @JoinColumn({ name: 'reverted_by_user_id' })
  revertedBy: AppUser | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
