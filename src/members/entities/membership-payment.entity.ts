import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { FIELDTRACK_SCHEMA } from '../../common/constants/schema-name';
import { AppUser } from '../../users/entities/app-user.entity';
import { Member } from './member.entity';

@Entity({ schema: FIELDTRACK_SCHEMA, name: 'membership_payments' })
export class MembershipPayment {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'club_id', type: 'int' })
  clubId: number;

  @Column({ name: 'member_id', type: 'int' })
  memberId: number;

  @ManyToOne(() => Member, (member) => member.payments, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'member_id' })
  member: Member;

  @Column({ type: 'text' })
  membership: string;

  @Column({ name: 'paid_on', type: 'date' })
  paidOn: string;

  /** Inicio del periodo que cubre. Puede ser un periodo pasado si el socio pagó atrasado. */
  @Column({ name: 'period_start', type: 'date' })
  periodStart: string;

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
