import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialFieldtrackSchema1740400000000 implements MigrationInterface {
  name = 'InitialFieldtrackSchema1740400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE SCHEMA IF NOT EXISTS fieldtrack;`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP SCHEMA IF EXISTS fieldtrack CASCADE;`);
  }
}
