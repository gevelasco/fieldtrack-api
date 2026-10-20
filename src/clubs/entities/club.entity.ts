import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { FIELDTRACK_SCHEMA } from '../../common/constants/schema-name';

@Entity({ schema: FIELDTRACK_SCHEMA, name: 'clubs' })
export class Club {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'text' })
  name: string;

  @Column({ type: 'text', nullable: true })
  tagline: string | null;

  @Column({ name: 'legal_name', type: 'text', nullable: true })
  legalName: string | null;

  @Column({ name: 'logo_data_url', type: 'text', nullable: true })
  logoDataUrl: string | null;

  @Column({ name: 'member_number_prefix', type: 'text', default: 'SOC-' })
  memberNumberPrefix: string;

  @Column({ name: 'subscription_status', type: 'text', default: 'active' })
  subscriptionStatus: string;

  @Column({ name: 'subscription_bonus_months', type: 'int', default: 0 })
  subscriptionBonusMonths: number;

  @Column({
    name: 'sport_shooting_fee_mxn',
    type: 'numeric',
    precision: 12,
    scale: 2,
    default: 2800,
  })
  sportShootingFeeMxn: string;

  @Column({
    name: 'hunting_fee_mxn',
    type: 'numeric',
    precision: 12,
    scale: 2,
    default: 3500,
  })
  huntingFeeMxn: string;

  @Column({ name: 'sport_shooting_start_month', type: 'smallint', default: 1 })
  sportShootingStartMonth: number;

  @Column({ name: 'sport_shooting_start_day', type: 'smallint', default: 1 })
  sportShootingStartDay: number;

  @Column({ name: 'sport_shooting_end_month', type: 'smallint', default: 12 })
  sportShootingEndMonth: number;

  @Column({ name: 'sport_shooting_end_day', type: 'smallint', default: 31 })
  sportShootingEndDay: number;

  @Column({ name: 'hunting_start_month', type: 'smallint', default: 6 })
  huntingStartMonth: number;

  @Column({ name: 'hunting_start_day', type: 'smallint', default: 1 })
  huntingStartDay: number;

  @Column({ name: 'hunting_end_month', type: 'smallint', default: 5 })
  huntingEndMonth: number;

  @Column({ name: 'hunting_end_day', type: 'smallint', default: 31 })
  huntingEndDay: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
