import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { FIELDTRACK_SCHEMA } from '../../common/constants/schema-name';
import { HuntingSpecies } from './hunting-species.entity';
import { HuntingTagSale } from './hunting-tag-sale.entity';

@Entity({ schema: FIELDTRACK_SCHEMA, name: 'hunting_seasons' })
export class HuntingSeason {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'club_id', type: 'int' })
  clubId: number;

  @Column({ name: 'species_id', type: 'int' })
  speciesId: number;

  @ManyToOne(() => HuntingSpecies, (species) => species.seasons, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'species_id' })
  species: HuntingSpecies;

  /** Especie y años, p. ej. «Paloma huilota 2026-2027»; solo un año si no cruza de año. */
  @Column({ type: 'text' })
  label: string;

  @Column({ name: 'starts_on', type: 'date' })
  startsOn: string;

  @Column({ name: 'ends_on', type: 'date' })
  endsOn: string;

  @Column({ name: 'tag_count', type: 'int' })
  tagCount: number;

  @Column({ name: 'tag_price', type: 'numeric', precision: 12, scale: 2 })
  tagPrice: string;

  /** Reglas, notas o restricciones de la temporada (p. ej. solo machos, límite por cazador). */
  @Column({ type: 'text', default: '' })
  notes: string;

  /** Primer folio del lote, solo para sugerir el siguiente al vender; no obliga a usarlo en orden. */
  @Column({ name: 'first_folio', type: 'text', nullable: true })
  firstFolio: string | null;

  @Column({ name: 'created_by_user_id', type: 'int' })
  createdByUserId: number;

  @OneToMany(() => HuntingTagSale, (sale) => sale.season)
  sales: HuntingTagSale[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
