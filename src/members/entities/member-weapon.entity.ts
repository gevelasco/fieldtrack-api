import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { FIELDTRACK_SCHEMA } from '../../common/constants/schema-name';
import { Member } from './member.entity';

@Entity({ schema: FIELDTRACK_SCHEMA, name: 'member_weapons' })
export class MemberWeapon {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'club_id', type: 'int' })
  clubId: number;

  @Column({ name: 'member_id', type: 'int' })
  memberId: number;

  @ManyToOne(() => Member, (member) => member.weapons, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'member_id' })
  member: Member;

  @Column({ type: 'text' })
  brand: string;

  @Column({ type: 'text' })
  model: string;

  @Column({ type: 'text' })
  caliber: string;

  @Column({ name: 'serial_number', type: 'text', default: '' })
  serialNumber: string;

  @Column({ type: 'text' })
  platform: string;

  @Column({ type: 'text' })
  modality: string;

  @Column({ name: 'has_peta', type: 'boolean', default: false })
  hasPeta: boolean;

  @Column({ name: 'registered_on', type: 'date' })
  registeredOn: string;

  @Column({ name: 'sheet_file_name', type: 'text', nullable: true })
  sheetFileName: string | null;

  @Column({ name: 'sheet_content_type', type: 'text', nullable: true })
  sheetContentType: string | null;

  @Column({ name: 'sheet_size_bytes', type: 'bigint', nullable: true })
  sheetSizeBytes: string | null;

  @Column({ name: 'sheet_storage_key', type: 'text', nullable: true })
  sheetStorageKey: string | null;

  @Column({ name: 'sheet_content', type: 'bytea', nullable: true, select: false })
  sheetContent: Buffer | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
