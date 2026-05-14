import "server-only";

import { isRoleAllowed, type AppRole } from "./roles";

export const DOCUMENTARY_ADMIN_MINIMUM_ROLE = "expert" satisfies AppRole;

export type DocumentaryAdminRole = Extract<AppRole, "admin" | "expert">;

export function canAccessDocumentaryAdmin(
  role: AppRole,
): role is DocumentaryAdminRole {
  return isRoleAllowed(role, [DOCUMENTARY_ADMIN_MINIMUM_ROLE]);
}
