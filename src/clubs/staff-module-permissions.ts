import { BadRequestException, ForbiddenException } from '@nestjs/common';

export const STAFF_MODULE_IDS = [
  'members',
  'requests',
  'calendario',
  'hunting',
  'competitions',
  'recaudacion',
  'configuracion',
] as const;

export type StaffModuleId = (typeof STAFF_MODULE_IDS)[number];

export type StaffModuleAccess = 'view' | 'write';

export type StaffModulePermissions = Record<StaffModuleId, StaffModuleAccess | null>;

const EMPTY: StaffModulePermissions = {
  members: null,
  requests: null,
  calendario: null,
  hunting: null,
  competitions: null,
  recaudacion: null,
  configuracion: null,
};

export function emptyStaffModulePermissions(): StaffModulePermissions {
  return { ...EMPTY };
}

export function normalizeStaffModulePermissions(input: unknown): StaffModulePermissions {
  const next = emptyStaffModulePermissions();
  if (!input || typeof input !== 'object') {
    return next;
  }
  for (const key of STAFF_MODULE_IDS) {
    const value = (input as Record<string, unknown>)[key];
    if (value === 'view' || value === 'write') {
      next[key] = value;
    }
  }
  return next;
}

export function assertStaffModulePermissions(input: unknown): StaffModulePermissions {
  const permissions = normalizeStaffModulePermissions(input);
  if (!STAFF_MODULE_IDS.some((key) => permissions[key] !== null)) {
    throw new BadRequestException('Asigna al menos un permiso de módulo.');
  }
  return permissions;
}

export function staffCanAccess(
  role: string,
  permissions: StaffModulePermissions | null | undefined,
  module: StaffModuleId,
  level: 'view' | 'write',
): boolean {
  if (role === 'admin') {
    return true;
  }
  if (role !== 'staff') {
    return false;
  }
  const access = permissions?.[module] ?? null;
  if (level === 'view') {
    return access === 'view' || access === 'write';
  }
  return access === 'write';
}

export function requireStaffModule(
  role: string,
  permissions: StaffModulePermissions | null | undefined,
  module: StaffModuleId,
  level: 'view' | 'write',
): void {
  if (!staffCanAccess(role, permissions, module, level)) {
    throw new ForbiddenException('No tienes permiso para esta acción.');
  }
}
