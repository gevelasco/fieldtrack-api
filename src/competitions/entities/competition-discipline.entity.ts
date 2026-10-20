import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { FIELDTRACK_SCHEMA } from '../../common/constants/schema-name';
import { CompetitionEdition } from './competition-edition.entity';

@Entity({ schema: FIELDTRACK_SCHEMA, name: 'competition_disciplines' })
export class CompetitionDiscipline {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'club_id', type: 'int' })
  clubId: number;

  @Column({ type: 'text' })
  name: string;

  @Column({ type: 'text', default: '' })
  notes: string;

  @Column({ name: 'created_by_user_id', type: 'int' })
  createdByUserId: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @OneToMany(() => CompetitionEdition, (edition) => edition.discipline)
  editions?: CompetitionEdition[];
}
