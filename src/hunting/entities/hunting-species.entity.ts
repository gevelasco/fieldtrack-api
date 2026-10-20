import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { FIELDTRACK_SCHEMA } from '../../common/constants/schema-name';
import { HuntingSeason } from './hunting-season.entity';

/** Mismos nombres que los íconos de la app; `ciervo` es el venado. */
export const SPECIES_ICONS = [
  'ciervo',
  'conejo',
  'jabali',
  'paloma',
  'pato',
  'iguana',
  'chivo',
  'vaca',
  'felino',
  'ocelote',
  'tejon',
  'pajaro',
] as const;
export type SpeciesIcon = (typeof SPECIES_ICONS)[number];

@Entity({ schema: FIELDTRACK_SCHEMA, name: 'hunting_species' })
export class HuntingSpecies {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'club_id', type: 'int' })
  clubId: number;

  @Column({ type: 'text' })
  name: string;

  @Column({ name: 'scientific_name', type: 'text', default: '' })
  scientificName: string;

  @Column({ type: 'text', default: 'ciervo' })
  icon: SpeciesIcon;

  @Column({ name: 'created_by_user_id', type: 'int' })
  createdByUserId: number;

  @OneToMany(() => HuntingSeason, (season) => season.species)
  seasons: HuntingSeason[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
