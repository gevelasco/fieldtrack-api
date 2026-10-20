import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { FIELDTRACK_SCHEMA } from '../../common/constants/schema-name';

/** Código de un solo uso para activar el alta de un club. */
@Entity({ schema: FIELDTRACK_SCHEMA, name: 'activation_codes' })
export class ActivationCode {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'text' })
  code: string;

  @Column({ name: 'max_uses', type: 'int', default: 1 })
  maxUses: number;

  @Column({ name: 'used_count', type: 'int', default: 0 })
  usedCount: number;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @Column({ name: 'redeemed_at', type: 'timestamptz', nullable: true })
  redeemedAt: Date | null;

  @Column({ name: 'redeemed_by_user_id', type: 'int', nullable: true })
  redeemedByUserId: number | null;

  @Column({ name: 'redeemed_by_club_id', type: 'int', nullable: true })
  redeemedByClubId: number | null;

  @Column({ type: 'text', nullable: true })
  note: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
