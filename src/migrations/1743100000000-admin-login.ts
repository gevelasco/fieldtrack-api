import { hash } from 'bcrypt';
import { MigrationInterface, QueryRunner } from 'typeorm';

const ADMIN_EMAIL = 'gvelasco@vsc.com';
const ADMIN_PASSWORD = 'Admin123';

/** Acceso del administrador de Club Coliman, sobre los datos que ya existen. */
export class AdminLogin1743100000000 implements MigrationInterface {
  name = 'AdminLogin1743100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const passwordHash = await hash(ADMIN_PASSWORD, 10);
    await queryRunner.query(
      `
      UPDATE fieldtrack.app_user
         SET email = $1,
             password_hash = $2
       WHERE username = 'german'
         AND role = 'admin'
         AND club_id = (
           SELECT id FROM fieldtrack.clubs WHERE name = 'Club Coliman'
         );
    `,
      [ADMIN_EMAIL, passwordHash],
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `
      UPDATE fieldtrack.app_user
         SET email = NULL
       WHERE username = 'german'
         AND role = 'admin'
         AND lower(email) = lower($1);
    `,
      [ADMIN_EMAIL],
    );
  }
}
