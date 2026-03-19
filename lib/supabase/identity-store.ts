import "server-only";

import type { AppRole } from "@/lib/auth/roles";
import { appRoles, isAppRole } from "@/lib/auth/roles";
import { supabaseAdmin, type SupabaseAdminClient } from "./client";

export type PersistedAppUser = {
  id: string;
  email: string | null;
  emailVerifiedAt: string | null;
};

export type PersistedAppProfile = {
  displayName: string | null;
  avatarUrl: string | null;
  locale: string | null;
  timezone: string | null;
};

export type AppIdentityStore = {
  listRoleCodes(userId: string): Promise<AppRole[]>;
  seedRoleCodes(userId: string, roleCodes: readonly AppRole[]): Promise<void>;
  upsertProfile(input: {
    avatarUrl: string | null;
    displayName: string | null;
    userId: string;
  }): Promise<PersistedAppProfile>;
  upsertUser(input: {
    authProvider: string;
    authSubject: string;
    email: string | null;
    emailVerified: boolean;
  }): Promise<PersistedAppUser>;
};

type UserRow = {
  email: string | null;
  email_verified_at: string | null;
  id: string;
};

type UserRoleRow = {
  role_id: string;
};

type RoleRow = {
  code: string;
  id: string;
};

type ProfileRow = {
  avatar_url: string | null;
  display_name: string | null;
  locale: string | null;
  timezone: string | null;
};

function mapPersistedProfile(row: ProfileRow | null): PersistedAppProfile {
  return {
    displayName: row?.display_name ?? null,
    avatarUrl: row?.avatar_url ?? null,
    locale: row?.locale ?? null,
    timezone: row?.timezone ?? null,
  };
}

function resolveRoleCodes(rows: RoleRow[]) {
  return rows
    .map((row) => row.code)
    .filter((code): code is AppRole => isAppRole(code))
    .sort((left, right) => appRoles.indexOf(left) - appRoles.indexOf(right));
}

function getCurrentTimestamp() {
  return new Date().toISOString();
}

export function createAppIdentityStore(
  client: SupabaseAdminClient = supabaseAdmin,
): AppIdentityStore {
  return {
    async upsertUser(input) {
      const { data: existingUser, error: existingUserError } = await client
        .from("users")
        .select("id, email, email_verified_at")
        .eq("auth_provider", input.authProvider)
        .eq("auth_subject", input.authSubject)
        .maybeSingle<UserRow>();

      if (existingUserError) {
        throw new Error(
          `Failed to load persisted user: ${existingUserError.message}`,
        );
      }

      const { data: user, error } = await client
        .from("users")
        .upsert(
          {
            auth_provider: input.authProvider,
            auth_subject: input.authSubject,
            email: input.email,
            email_verified_at:
              existingUser?.email_verified_at ??
              (input.emailVerified ? getCurrentTimestamp() : null),
            updated_at: getCurrentTimestamp(),
          },
          {
            onConflict: "auth_provider,auth_subject",
          },
        )
        .select("id, email, email_verified_at")
        .single<UserRow>();

      if (error || !user) {
        throw new Error(`Failed to upsert persisted user: ${error?.message}`);
      }

      return {
        id: user.id,
        email: user.email,
        emailVerifiedAt: user.email_verified_at,
      };
    },

    async upsertProfile(input) {
      const { data: existingProfile, error: existingProfileError } =
        await client
          .from("profiles")
          .select("display_name, avatar_url, locale, timezone")
          .eq("user_id", input.userId)
          .maybeSingle<ProfileRow>();

      if (existingProfileError) {
        throw new Error(
          `Failed to load persisted profile: ${existingProfileError.message}`,
        );
      }

      const { data: profile, error } = await client
        .from("profiles")
        .upsert(
          {
            user_id: input.userId,
            display_name:
              input.displayName ?? existingProfile?.display_name ?? null,
            avatar_url: input.avatarUrl ?? existingProfile?.avatar_url ?? null,
            locale: existingProfile?.locale ?? null,
            timezone: existingProfile?.timezone ?? null,
            updated_at: getCurrentTimestamp(),
          },
          {
            onConflict: "user_id",
          },
        )
        .select("display_name, avatar_url, locale, timezone")
        .single<ProfileRow>();

      if (error || !profile) {
        throw new Error(
          `Failed to upsert persisted profile: ${error?.message}`,
        );
      }

      return mapPersistedProfile(profile);
    },

    async listRoleCodes(userId) {
      const { data: userRoles, error: userRolesError } = await client
        .from("user_roles")
        .select("role_id")
        .eq("user_id", userId)
        .returns<UserRoleRow[]>();

      if (userRolesError) {
        throw new Error(
          `Failed to load persisted role assignments: ${userRolesError.message}`,
        );
      }

      const roleIds = userRoles.map((row) => row.role_id);

      if (roleIds.length === 0) {
        return [];
      }

      const { data: roles, error: rolesError } = await client
        .from("roles")
        .select("id, code")
        .in("id", roleIds)
        .returns<RoleRow[]>();

      if (rolesError) {
        throw new Error(
          `Failed to load persisted roles: ${rolesError.message}`,
        );
      }

      return resolveRoleCodes(roles);
    },

    async seedRoleCodes(userId, roleCodes) {
      const requestedRoleCodes = [...new Set(roleCodes)];

      if (requestedRoleCodes.length === 0) {
        return;
      }

      const { data: roles, error: rolesError } = await client
        .from("roles")
        .select("id, code")
        .in("code", requestedRoleCodes)
        .returns<RoleRow[]>();

      if (rolesError) {
        throw new Error(
          `Failed to resolve persisted role ids: ${rolesError.message}`,
        );
      }

      if (roles.length !== requestedRoleCodes.length) {
        throw new Error(
          "Failed to seed persisted roles: role lookup incomplete",
        );
      }

      const { error } = await client.from("user_roles").upsert(
        roles.map((role) => ({
          user_id: userId,
          role_id: role.id,
          granted_at: getCurrentTimestamp(),
        })),
        {
          onConflict: "user_id,role_id",
          ignoreDuplicates: true,
        },
      );

      if (error) {
        throw new Error(`Failed to seed persisted roles: ${error.message}`);
      }
    },
  };
}

export const appIdentityStore = createAppIdentityStore();
