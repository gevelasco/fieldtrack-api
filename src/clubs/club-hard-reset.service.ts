import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import * as XLSX from 'xlsx';
import { AppUser } from '../users/entities/app-user.entity';
import { FIELDTRACK_SCHEMA } from '../common/constants/schema-name';
import { Club } from './entities/club.entity';

export interface ClubHardResetResult {
  workbook: Buffer;
  filename: string;
  summary: {
    members: number;
    weapons: number;
    staffUsers: number;
  };
}

@Injectable()
export class ClubHardResetService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Club) private readonly clubs: Repository<Club>,
  ) {}

  async reset(clubId: number, actor: AppUser): Promise<ClubHardResetResult> {
    if (actor.role !== 'admin') {
      throw new ForbiddenException('Solo el administrador del club puede ejecutar el reinicio total.');
    }
    const club = await this.clubs.findOne({ where: { id: clubId } });
    if (!club) {
      throw new NotFoundException('No se encontró el club.');
    }

    const backup = await this.buildMembersWeaponsBackup(clubId);
    const summary = await this.dataSource.transaction(async (manager) => {
      const counts = await manager.query(
        `
        SELECT
          (SELECT count(*)::int FROM ${FIELDTRACK_SCHEMA}.members WHERE club_id = $1) AS members,
          (SELECT count(*)::int FROM ${FIELDTRACK_SCHEMA}.member_weapons WHERE club_id = $1) AS weapons,
          (SELECT count(*)::int FROM ${FIELDTRACK_SCHEMA}.app_user WHERE club_id = $1 AND role <> 'admin') AS staff_users
        `,
        [clubId],
      );
      const row = counts[0] as { members: number; weapons: number; staff_users: number };

      // Notificaciones
      await manager.query(
        `
        DELETE FROM ${FIELDTRACK_SCHEMA}.club_notification_reads
        WHERE notification_id IN (
          SELECT id FROM ${FIELDTRACK_SCHEMA}.club_notifications WHERE club_id = $1
        )
        `,
        [clubId],
      );
      await manager.query(`DELETE FROM ${FIELDTRACK_SCHEMA}.club_notifications WHERE club_id = $1`, [clubId]);

      // Solicitudes
      await manager.query(
        `
        DELETE FROM ${FIELDTRACK_SCHEMA}.club_request_comments
        WHERE request_id IN (SELECT id FROM ${FIELDTRACK_SCHEMA}.club_requests WHERE club_id = $1)
        `,
        [clubId],
      );
      await manager.query(
        `
        DELETE FROM ${FIELDTRACK_SCHEMA}.club_request_documents
        WHERE request_id IN (SELECT id FROM ${FIELDTRACK_SCHEMA}.club_requests WHERE club_id = $1)
        `,
        [clubId],
      );
      await manager.query(
        `
        DELETE FROM ${FIELDTRACK_SCHEMA}.club_request_events
        WHERE request_id IN (SELECT id FROM ${FIELDTRACK_SCHEMA}.club_requests WHERE club_id = $1)
        `,
        [clubId],
      );
      await manager.query(`DELETE FROM ${FIELDTRACK_SCHEMA}.club_requests WHERE club_id = $1`, [clubId]);

      // Checklist del club
      await manager.query(`DELETE FROM ${FIELDTRACK_SCHEMA}.user_checklist_items WHERE club_id = $1`, [clubId]);

      // Calendario / eventos (antes de borrar usuarios por FK created_by)
      await manager.query(`DELETE FROM ${FIELDTRACK_SCHEMA}.club_events WHERE club_id = $1`, [clubId]);

      // Torneos
      await manager.query(`DELETE FROM ${FIELDTRACK_SCHEMA}.competition_registrations WHERE club_id = $1`, [clubId]);
      await manager.query(`DELETE FROM ${FIELDTRACK_SCHEMA}.competition_editions WHERE club_id = $1`, [clubId]);
      await manager.query(`DELETE FROM ${FIELDTRACK_SCHEMA}.competition_disciplines WHERE club_id = $1`, [clubId]);

      // Cinegética
      await manager.query(`DELETE FROM ${FIELDTRACK_SCHEMA}.hunting_tag_sales WHERE club_id = $1`, [clubId]);
      await manager.query(`DELETE FROM ${FIELDTRACK_SCHEMA}.hunting_seasons WHERE club_id = $1`, [clubId]);
      await manager.query(`DELETE FROM ${FIELDTRACK_SCHEMA}.hunting_species WHERE club_id = $1`, [clubId]);

      // Recaudación y pagos
      await manager.query(`DELETE FROM ${FIELDTRACK_SCHEMA}.club_expenses WHERE club_id = $1`, [clubId]);
      await manager.query(`DELETE FROM ${FIELDTRACK_SCHEMA}.membership_payments WHERE club_id = $1`, [clubId]);

      // Reportes SEDENA (movimientos de armas)
      await manager.query(`DELETE FROM ${FIELDTRACK_SCHEMA}.weapon_registry_movements WHERE club_id = $1`, [clubId]);

      // Socios y armas
      await manager.query(`DELETE FROM ${FIELDTRACK_SCHEMA}.member_petas WHERE club_id = $1`, [clubId]);
      await manager.query(
        `
        DELETE FROM ${FIELDTRACK_SCHEMA}.member_documents
        WHERE member_id IN (SELECT id FROM ${FIELDTRACK_SCHEMA}.members WHERE club_id = $1)
        `,
        [clubId],
      );
      await manager.query(`DELETE FROM ${FIELDTRACK_SCHEMA}.member_weapons WHERE club_id = $1`, [clubId]);
      await manager.query(`UPDATE ${FIELDTRACK_SCHEMA}.members SET user_id = NULL WHERE club_id = $1`, [clubId]);
      await manager.query(`DELETE FROM ${FIELDTRACK_SCHEMA}.members WHERE club_id = $1`, [clubId]);

      // Usuarios staff / socio (conserva admins del club)
      await manager.query(
        `
        DELETE FROM ${FIELDTRACK_SCHEMA}.refresh_tokens
        WHERE user_id IN (
          SELECT id FROM ${FIELDTRACK_SCHEMA}.app_user WHERE club_id = $1 AND role <> 'admin'
        )
        `,
        [clubId],
      );
      await manager.query(
        `
        DELETE FROM ${FIELDTRACK_SCHEMA}.user_preferences
        WHERE user_id IN (
          SELECT id FROM ${FIELDTRACK_SCHEMA}.app_user WHERE club_id = $1 AND role <> 'admin'
        )
        `,
        [clubId],
      );
      await manager.query(
        `DELETE FROM ${FIELDTRACK_SCHEMA}.app_user WHERE club_id = $1 AND role <> 'admin'`,
        [clubId],
      );

      // Invites del club
      await manager.query(`DELETE FROM ${FIELDTRACK_SCHEMA}.club_invite_codes WHERE club_id = $1`, [clubId]);

      return {
        members: Number(row.members) || 0,
        weapons: Number(row.weapons) || 0,
        staffUsers: Number(row.staff_users) || 0,
      };
    });

    const stamp = new Date().toISOString().slice(0, 10);
    const safeName = (club.name || 'club')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\w]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40);
    return {
      workbook: backup,
      filename: `fieldtrack-backup-hard-reset-${safeName || 'club'}-${stamp}.xlsx`,
      summary,
    };
  }

  private async buildMembersWeaponsBackup(clubId: number): Promise<Buffer> {
    const memberRows = (await this.dataSource.query(
      `
      SELECT
        m.id,
        m.member_number,
        m.first_name,
        m.paternal_surname,
        m.maternal_surname,
        m.curp,
        m.rfc,
        m.email,
        m.phone,
        m.address,
        m.sex,
        m.modality,
        m.membership,
        m.status,
        m.joined_on::text AS joined_on
      FROM ${FIELDTRACK_SCHEMA}.members m
      WHERE m.club_id = $1
      ORDER BY m.member_number
      `,
      [clubId],
    )) as Array<Record<string, unknown>>;

    const weaponRows = (await this.dataSource.query(
      `
      SELECT
        w.member_id,
        m.member_number,
        w.brand,
        w.model,
        w.caliber,
        w.serial_number,
        w.platform,
        w.modality,
        w.has_peta,
        w.registered_on::text AS registered_on
      FROM ${FIELDTRACK_SCHEMA}.member_weapons w
      INNER JOIN ${FIELDTRACK_SCHEMA}.members m ON m.id = w.member_id
      WHERE w.club_id = $1
      ORDER BY m.member_number, w.id
      `,
      [clubId],
    )) as Array<Record<string, unknown>>;

    const weaponsByMemberId = new Map<number, Array<Record<string, unknown>>>();
    for (const weapon of weaponRows) {
      const memberId = Number(weapon.member_id);
      const list = weaponsByMemberId.get(memberId) ?? [];
      list.push(weapon);
      weaponsByMemberId.set(memberId, list);
    }

    /** Hoja principal: una fila por arma (o una fila sin arma). Reimportable como padrón. */
    const padronRows: Record<string, string>[] = [];
    for (const member of memberRows) {
      const memberId = Number(member.id);
      const memberBase = {
        numero_socio: String(member.member_number ?? ''),
        nombre: String(member.first_name ?? ''),
        apellido_paterno: String(member.paternal_surname ?? ''),
        apellido_materno: String(member.maternal_surname ?? ''),
        tipo_membresia: String(member.membership ?? ''),
        modalidad_membresia: String(member.modality ?? ''),
        telefono: String(member.phone ?? ''),
        correo: String(member.email ?? ''),
        fecha_ingreso: String(member.joined_on ?? ''),
        sexo: String(member.sex ?? ''),
        curp: String(member.curp ?? ''),
        rfc: String(member.rfc ?? ''),
        direccion: String(member.address ?? ''),
        estatus: String(member.status ?? ''),
      };
      const weapons = weaponsByMemberId.get(memberId) ?? [];
      if (weapons.length === 0) {
        padronRows.push({
          ...memberBase,
          marca: '',
          modelo: '',
          calibre: '',
          numero_serie: '',
          plataforma: '',
          modalidad_arma: '',
          con_peta: '',
          fecha_registro: '',
        });
        continue;
      }
      for (const weapon of weapons) {
        padronRows.push({
          ...memberBase,
          marca: String(weapon.brand ?? ''),
          modelo: String(weapon.model ?? ''),
          calibre: String(weapon.caliber ?? ''),
          numero_serie: String(weapon.serial_number ?? ''),
          plataforma: String(weapon.platform ?? ''),
          modalidad_arma: String(weapon.modality ?? ''),
          con_peta: weapon.has_peta ? 'si' : 'no',
          fecha_registro: String(weapon.registered_on ?? ''),
        });
      }
    }

    const sociosSheet = memberRows.map((row) => ({
      numero_socio: String(row.member_number ?? ''),
      nombre: String(row.first_name ?? ''),
      apellido_paterno: String(row.paternal_surname ?? ''),
      apellido_materno: String(row.maternal_surname ?? ''),
      tipo_membresia: String(row.membership ?? ''),
      modalidad_membresia: String(row.modality ?? ''),
      telefono: String(row.phone ?? ''),
      correo: String(row.email ?? ''),
      fecha_ingreso: String(row.joined_on ?? ''),
      sexo: String(row.sex ?? ''),
      curp: String(row.curp ?? ''),
      rfc: String(row.rfc ?? ''),
      direccion: String(row.address ?? ''),
      estatus: String(row.status ?? ''),
    }));

    const armasSheet = weaponRows.map((row) => ({
      numero_socio: String(row.member_number ?? ''),
      marca: String(row.brand ?? ''),
      modelo: String(row.model ?? ''),
      calibre: String(row.caliber ?? ''),
      numero_serie: String(row.serial_number ?? ''),
      plataforma: String(row.platform ?? ''),
      modalidad: String(row.modality ?? ''),
      con_peta: row.has_peta ? 'si' : 'no',
      fecha_registro: String(row.registered_on ?? ''),
    }));

    const emptyPadron = {
      numero_socio: '',
      nombre: '',
      apellido_paterno: '',
      apellido_materno: '',
      tipo_membresia: '',
      modalidad_membresia: '',
      telefono: '',
      correo: '',
      fecha_ingreso: '',
      sexo: '',
      curp: '',
      rfc: '',
      direccion: '',
      estatus: '',
      marca: '',
      modelo: '',
      calibre: '',
      numero_serie: '',
      plataforma: '',
      modalidad_arma: '',
      con_peta: '',
      fecha_registro: '',
    };

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(padronRows.length ? padronRows : [emptyPadron]),
      'Padron',
    );
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(
        sociosSheet.length
          ? sociosSheet
          : [
              {
                numero_socio: '',
                nombre: '',
                apellido_paterno: '',
                apellido_materno: '',
                tipo_membresia: '',
                modalidad_membresia: '',
                telefono: '',
                correo: '',
                fecha_ingreso: '',
                sexo: '',
                curp: '',
                rfc: '',
                direccion: '',
                estatus: '',
              },
            ],
      ),
      'Socios',
    );
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(
        armasSheet.length
          ? armasSheet
          : [
              {
                numero_socio: '',
                marca: '',
                modelo: '',
                calibre: '',
                numero_serie: '',
                plataforma: '',
                modalidad: '',
                con_peta: '',
                fecha_registro: '',
              },
            ],
      ),
      'Armas',
    );
    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  }
}
