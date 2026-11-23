import { EntityManager } from 'typeorm';
import { MemberWeapon } from './entities/member-weapon.entity';

export type WeaponRegistryMovement = 'alta' | 'baja';

export interface WeaponMovementSnapshot {
  clubId: number;
  memberId: number;
  weaponId: number | null;
  movement: WeaponRegistryMovement;
  movementOn: string;
  platform: string;
  modality: string;
  serialNumber: string;
  brand: string;
  model: string;
  caliber: string;
  recordedByUserId: number | null;
}

export async function insertWeaponRegistryMovement(
  manager: EntityManager,
  row: WeaponMovementSnapshot,
): Promise<void> {
  await manager.query(
    `INSERT INTO fieldtrack.weapon_registry_movements (
       club_id, member_id, weapon_id, movement, movement_on,
       platform, modality, serial_number, brand, model, caliber,
       recorded_by_user_id
     ) VALUES ($1, $2, $3, $4, $5::date, $6, $7, $8, $9, $10, $11, $12)`,
    [
      row.clubId,
      row.memberId,
      row.weaponId,
      row.movement,
      row.movementOn,
      row.platform,
      row.modality,
      row.serialNumber,
      row.brand,
      row.model,
      row.caliber,
      row.recordedByUserId,
    ],
  );
}

export function snapshotFromWeapon(
  weapon: MemberWeapon,
  movement: WeaponRegistryMovement,
  movementOn: string,
  recordedByUserId: number | null,
  weaponId: number | null = weapon.id,
): WeaponMovementSnapshot {
  return {
    clubId: weapon.clubId,
    memberId: weapon.memberId,
    weaponId,
    movement,
    movementOn,
    platform: weapon.platform,
    modality: weapon.modality,
    serialNumber: weapon.serialNumber ?? '',
    brand: weapon.brand,
    model: weapon.model,
    caliber: weapon.caliber,
    recordedByUserId,
  };
}