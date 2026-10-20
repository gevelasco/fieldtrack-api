import { hash } from 'bcrypt';
import { MigrationInterface, QueryRunner } from 'typeorm';

const DEMO_PASSWORD = 'fieldtrack';

export class AuthDemoUsers1742800000000 implements MigrationInterface {
  name = 'AuthDemoUsers1742800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const passwordHash = await hash(DEMO_PASSWORD, 10);
    await queryRunner.query(
      `
      UPDATE fieldtrack.app_user
         SET password_hash = $1
       WHERE username = 'german'
         AND role = 'admin';
    `,
      [passwordHash],
    );
    await queryRunner.query(
      `
      INSERT INTO fieldtrack.app_user (club_id, username, display_name, email, password_hash, role, status)
      SELECT clubs.id, 'staff', 'Personal Coliman', 'staff@coliman.local', $1, 'staff', 'active'
        FROM fieldtrack.clubs
       WHERE clubs.name = 'Club Coliman'
         AND NOT EXISTS (
           SELECT 1 FROM fieldtrack.app_user existing
            WHERE existing.club_id = clubs.id AND existing.username = 'staff'
         );
    `,
      [passwordHash],
    );
    await queryRunner.query(
      `
      INSERT INTO fieldtrack.app_user (club_id, username, display_name, email, password_hash, role, status)
      SELECT clubs.id, 'socio', 'Socio Coliman', 'socio@coliman.local', $1, 'socio', 'active'
        FROM fieldtrack.clubs
       WHERE clubs.name = 'Club Coliman'
         AND NOT EXISTS (
           SELECT 1 FROM fieldtrack.app_user existing
            WHERE existing.club_id = clubs.id AND existing.username = 'socio'
         );
    `,
      [passwordHash],
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM fieldtrack.app_user
       WHERE username IN ('staff', 'socio')
         AND role IN ('staff', 'socio');
    `);
  }
}
