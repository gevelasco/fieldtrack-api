import { AppUser } from '../users/entities/app-user.entity';
import {
  normalizeStaffModulePermissions,
  requireStaffModule,
  type StaffModuleId,
} from './staff-module-permissions';

export function assertStaffModuleAccess(
  user: AppUser,
  module: StaffModuleId,
  level: 'view' | 'write',
): void {
  requireStaffModule(user.role, normalizeStaffModulePermissions(user.modulePermissions), module, level);
}
