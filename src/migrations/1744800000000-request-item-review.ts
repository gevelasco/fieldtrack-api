import { MigrationInterface, QueryRunner } from 'typeorm';

const BASE_EVENT_KINDS = `
  'created', 'updated', 'started', 'returned', 'completed', 'reopened',
  'document_added', 'document_removed', 'removed',
  'member_submitted', 'comment_added'`;

/** Cada archivo de una solicitud puede ir ligado a un documento o arma pedidos y tener su revisión. */
export class RequestItemReview1744800000000 implements MigrationInterface {
  name = 'RequestItemReview1744800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE fieldtrack.club_request_documents
        ADD COLUMN IF NOT EXISTS item_slot text NULL,
        ADD COLUMN IF NOT EXISTS item_weapon_id int NULL,
        ADD COLUMN IF NOT EXISTS review_status text NULL,
        ADD COLUMN IF NOT EXISTS review_note text NULL,
        ADD COLUMN IF NOT EXISTS reviewed_at timestamptz NULL,
        ADD COLUMN IF NOT EXISTS reviewed_by_user_id int NULL;
    `);
    await queryRunner.query(`
      ALTER TABLE fieldtrack.club_request_documents
        ADD CONSTRAINT club_request_documents_review_status_chk
          CHECK (review_status IN ('pending', 'approved', 'rejected')),
        ADD CONSTRAINT club_request_documents_item_chk CHECK (
          (item_slot IS NULL OR item_weapon_id IS NULL)
          AND ((item_slot IS NULL AND item_weapon_id IS NULL) = (review_status IS NULL))
        ),
        ADD CONSTRAINT club_request_documents_reviewer_same_club_fk
          FOREIGN KEY (reviewed_by_user_id, club_id) REFERENCES fieldtrack.app_user (id, club_id);
    `);
    await queryRunner.query(`
      ALTER TABLE fieldtrack.club_request_events DROP CONSTRAINT IF EXISTS club_request_events_kind_check;
    `);
    await queryRunner.query(`
      ALTER TABLE fieldtrack.club_request_events ADD CONSTRAINT club_request_events_kind_check CHECK (kind IN (
        ${BASE_EVENT_KINDS}, 'item_uploaded', 'item_approved', 'item_rejected'
      ));
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE fieldtrack.club_request_events SET kind = 'updated'
      WHERE kind IN ('item_uploaded', 'item_approved', 'item_rejected');
    `);
    await queryRunner.query(`
      ALTER TABLE fieldtrack.club_request_events DROP CONSTRAINT IF EXISTS club_request_events_kind_check;
    `);
    await queryRunner.query(`
      ALTER TABLE fieldtrack.club_request_events ADD CONSTRAINT club_request_events_kind_check CHECK (kind IN (
        ${BASE_EVENT_KINDS}
      ));
    `);
    await queryRunner.query(`
      ALTER TABLE fieldtrack.club_request_documents
        DROP CONSTRAINT IF EXISTS club_request_documents_reviewer_same_club_fk,
        DROP CONSTRAINT IF EXISTS club_request_documents_item_chk,
        DROP CONSTRAINT IF EXISTS club_request_documents_review_status_chk,
        DROP COLUMN IF EXISTS reviewed_by_user_id,
        DROP COLUMN IF EXISTS reviewed_at,
        DROP COLUMN IF EXISTS review_note,
        DROP COLUMN IF EXISTS review_status,
        DROP COLUMN IF EXISTS item_weapon_id,
        DROP COLUMN IF EXISTS item_slot;
    `);
  }
}
