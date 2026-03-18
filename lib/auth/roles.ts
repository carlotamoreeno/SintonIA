import "server-only";

export const appRoles = ["user", "expert", "admin"] as const;

export type AppRole = (typeof appRoles)[number];

export type RoleAllowlist = {
  expertEmails: string[];
  adminEmails: string[];
};

const roleRank: Record<AppRole, number> = {
  user: 0,
  expert: 1,
  admin: 2,
};

export function isAppRole(value: unknown): value is AppRole {
  return typeof value === "string" && appRoles.includes(value as AppRole);
}

export function normalizeEmail(email: string | null | undefined) {
  if (typeof email !== "string") {
    return null;
  }

  const normalizedEmail = email.trim().toLowerCase();

  return normalizedEmail.length > 0 ? normalizedEmail : null;
}

export function parseRoleEmailList(value: string | null | undefined) {
  if (typeof value !== "string") {
    return [];
  }

  return [
    ...new Set(
      value
        .split(",")
        .map((entry) => normalizeEmail(entry))
        .filter((entry): entry is string => entry !== null),
    ),
  ];
}

export function resolveUserRole(
  email: string | null | undefined,
  allowlist: RoleAllowlist,
): AppRole {
  const normalizedEmail = normalizeEmail(email);

  if (!normalizedEmail) {
    return "user";
  }

  if (allowlist.adminEmails.includes(normalizedEmail)) {
    return "admin";
  }

  if (allowlist.expertEmails.includes(normalizedEmail)) {
    return "expert";
  }

  return "user";
}

export function isRoleAllowed(
  currentRole: AppRole,
  allowedRoles: readonly AppRole[],
) {
  return allowedRoles.some(
    (allowedRole) => roleRank[currentRole] >= roleRank[allowedRole],
  );
}
