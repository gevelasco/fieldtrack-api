import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Ícono por especie, reglas o restricciones por temporada y nombres de temporada con la especie
 * («Paloma huilota 2026-2027»). Los folios se capturan uno a uno en cada venta, así que se quita el folio inicial.
 */
export class HuntingSpeciesIconNotes1741800000000 implements MigrationInterface {
  name = 'HuntingSpeciesIconNotes1741800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE fieldtrack.hunting_species
        ADD COLUMN icon text NOT NULL DEFAULT 'ciervo' CHECK (icon IN (
          'ciervo', 'conejo', 'jabali', 'paloma', 'pato', 'iguana', 'chivo', 'vaca', 'felino', 'ocelote', 'tejon', 'pajaro'
        ));
    `);
    await queryRunner.query(`
      UPDATE fieldtrack.hunting_species SET icon = CASE
        WHEN name ILIKE '%conejo%' OR name ILIKE '%liebre%' THEN 'conejo'
        WHEN name ILIKE '%jabal%' OR name ILIKE '%pecar%' THEN 'jabali'
        WHEN name ILIKE '%paloma%' OR name ILIKE '%huilota%' OR name ILIKE '%tórtola%' THEN 'paloma'
        WHEN name ILIKE '%pato%' OR name ILIKE '%ganso%' OR name ILIKE '%cerceta%' THEN 'pato'
        WHEN name ILIKE '%codorniz%' OR name ILIKE '%guajolote%' OR name ILIKE '%faisán%' THEN 'pajaro'
        ELSE 'ciervo'
      END;
    `);
    await queryRunner.query(`
      ALTER TABLE fieldtrack.hunting_seasons
        ADD COLUMN notes text NOT NULL DEFAULT '' CHECK (length(notes) <= 2000),
        DROP COLUMN first_folio;
    `);
    await queryRunner.query(`
      UPDATE fieldtrack.hunting_seasons s SET label = sp.name || ' ' || s.label
      FROM fieldtrack.hunting_species sp
      WHERE sp.id = s.species_id AND s.label NOT ILIKE sp.name || '%';
    `);
    await queryRunner.query(`
      UPDATE fieldtrack.club_events e SET title = 'Temporada ' || s.label
      FROM fieldtrack.hunting_seasons s
      WHERE s.id = e.hunting_season_id;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE fieldtrack.hunting_seasons
        ADD COLUMN first_folio text CHECK (first_folio ~ '^[0-9]{1,12}$'),
        DROP COLUMN IF EXISTS notes;
      ALTER TABLE fieldtrack.hunting_species DROP COLUMN IF EXISTS icon;
    `);
  }
}
