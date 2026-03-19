import "server-only";

import type { Session } from "next-auth";
import {
  appIdentityStore,
  type AppIdentityStore,
} from "@/lib/supabase/identity-store";
import { authEnv } from "./env";
import { parseAppUserId } from "./identity";
import { appRoles, resolveUserRole, type AppRole } from "./roles";

export type AuthenticatedAppSession = Session & {
  user: NonNullable<Session["user"]> & {
    email: string | null;
    emailVerified?: boolean;
    id: string;
    image: string | null;
    name: string | null;
    role: AppRole;
  };
};

export type SyncedPersistedIdentity = {
  profile: Awaited<ReturnType<AppIdentityStore["upsertProfile"]>>;
  role: AppRole;
  user: Awaited<ReturnType<AppIdentityStore["upsertUser"]>>;
};

function getBootstrapRoleCodes(email: string | null) {
  const effectiveRole = resolveUserRole(email, authEnv);

  return effectiveRole === "user"
    ? (["user"] as const)
    : (["user", effectiveRole] as const);
}

function resolvePersistedRole(
  persistedRoleCodes: readonly AppRole[],
  email: string | null,
) {
  if (persistedRoleCodes.length === 0) {
    return resolveUserRole(email, authEnv);
  }

  return [...persistedRoleCodes].sort(
    (left, right) => appRoles.indexOf(left) - appRoles.indexOf(right),
  )[persistedRoleCodes.length - 1];
}

export async function syncPersistedIdentity(
  session: AuthenticatedAppSession,
  store: AppIdentityStore = appIdentityStore,
): Promise<SyncedPersistedIdentity> {
  const authIdentity = parseAppUserId(session.user.id);

  if (!authIdentity) {
    throw new Error(`Invalid app user id: ${session.user.id}`);
  }

  const user = await store.upsertUser({
    authProvider: authIdentity.provider,
    authSubject: authIdentity.authSubject,
    email: session.user.email,
    emailVerified: session.user.emailVerified === true,
  });

  const profile = await store.upsertProfile({
    userId: user.id,
    displayName: session.user.name,
    avatarUrl: session.user.image,
  });

  let persistedRoleCodes = await store.listRoleCodes(user.id);

  if (persistedRoleCodes.length === 0) {
    persistedRoleCodes = [
      ...getBootstrapRoleCodes(user.email ?? session.user.email),
    ];
    await store.seedRoleCodes(user.id, persistedRoleCodes);
  }

  return {
    user,
    profile,
    role: resolvePersistedRole(
      persistedRoleCodes,
      user.email ?? session.user.email,
    ),
  };
}

export function hydrateSessionWithPersistedIdentity(
  session: AuthenticatedAppSession,
  persistedIdentity: SyncedPersistedIdentity,
): AuthenticatedAppSession {
  return {
    ...session,
    user: {
      ...session.user,
      email: persistedIdentity.user.email ?? session.user.email,
      image: persistedIdentity.profile.avatarUrl ?? session.user.image,
      name: persistedIdentity.profile.displayName ?? session.user.name,
      role: persistedIdentity.role,
    },
  };
}
