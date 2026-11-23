import type { MemberImportField } from './members-import-flex';

const MEMBER_IMPORT_FIELDS = new Set<MemberImportField>([
  'memberNumber',
  'fullName',
  'firstName',
  'paternalSurname',
  'maternalSurname',
  'curp',
  'rfc',
  'email',
  'phone',
  'mobile',
  'joinedOnRaw',
  'sexRaw',
  'membershipRaw',
  'membershipModalityRaw',
  'addressLine',
  'fullAddress',
  'colony',
  'city',
  'state',
  'zip',
]);

export type WeaponImportFieldId =
  | 'weaponBrand'
  | 'weaponModel'
  | 'weaponCaliber'
  | 'weaponSerial'
  | 'weaponPlatform'
  | 'weaponModality'
  | 'weaponHasPeta'
  | 'weaponRegisteredOn';

export type ImportFieldId = MemberImportField | WeaponImportFieldId | 'ignore';

export function isWeaponImportFieldId(value: string): value is WeaponImportFieldId {
  return value.startsWith('weapon');
}

export function isMemberImportField(id: ImportFieldId): id is MemberImportField {
  return MEMBER_IMPORT_FIELDS.has(id as MemberImportField);
}