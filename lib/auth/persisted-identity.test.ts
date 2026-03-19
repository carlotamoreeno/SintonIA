import type { AppRole } from "@/lib/auth/roles";
import type { AppIdentityStore } from "@/lib/supabase/identity-store";
import { beforeEach, describe, expect, it, vi } from "vitest";

type StoreState = {
  nextUserId: number;
  profilesByUserId: Record<
    string,
    {
      avatarUrl: string | null;
      displayName: string | null;
      locale: string | null;
      timezone: string | null;
    }
  >;
  rolesByUserId: Record<string, AppRole[]>;
  seededRoleCodes: AppRole[][];
  usersByIdentity: Record<
    string,
    {
      email: string | null;
      emailVerifiedAt: string | null;
      id: string;
    }
  >;
};

function buildSession(
  overrides?: Partial<{
    email: string | null;
    emailVerified: boolean;
    id: string;
    image: string | null;
    name: string | null;
    role: AppRole;
  }>,
) {
  return {
    expires: "2099-01-01T00:00:00.000Z",
    user: {
      id: overrides?.id ?? "google:sub_123",
      role: overrides?.role ?? "user",
      email: overrides?.email ?? "ana@example.com",
      emailVerified: overrides?.emailVerified ?? false,
      image: overrides?.image ?? "https://example.com/avatar.png",
      name: overrides?.name ?? "Ana",
    },
  };
}

function createIdentityStore(state: StoreState): AppIdentityStore {
  return {
    async upsertUser(input) {
      const key = `${input.authProvider}:${input.authSubject}`;
      const existingUser = state.usersByIdentity[key];

      if (existingUser) {
        state.usersByIdentity[key] = {
          ...existingUser,
          email: input.email,
          emailVerifiedAt:
            existingUser.emailVerifiedAt ??
            (input.emailVerified ? "2026-03-19T12:00:00.000Z" : null),
        };

        return state.usersByIdentity[key];
      }

      state.nextUserId += 1;
      state.usersByIdentity[key] = {
        id: `user-${state.nextUserId}`,
        email: input.email,
        emailVerifiedAt: input.emailVerified
          ? "2026-03-19T12:00:00.000Z"
          : null,
      };

      return state.usersByIdentity[key];
    },

    async upsertProfile(input) {
      const existingProfile = state.profilesByUserId[input.userId];

      state.profilesByUserId[input.userId] = {
        displayName: input.displayName ?? existingProfile?.displayName ?? null,
        avatarUrl: input.avatarUrl ?? existingProfile?.avatarUrl ?? null,
        locale: existingProfile?.locale ?? null,
        timezone: existingProfile?.timezone ?? null,
      };

      return state.profilesByUserId[input.userId];
    },

    async listRoleCodes(userId) {
      return state.rolesByUserId[userId] ?? [];
    },

    async seedRoleCodes(userId, roleCodes) {
      state.seededRoleCodes.push([...roleCodes]);
      state.rolesByUserId[userId] = [...roleCodes];
    },
  };
}

async function loadPersistedIdentityModule(env?: {
  adminEmails?: string;
  expertEmails?: string;
}) {
  vi.resetModules();
  process.env.AUTH_ADMIN_EMAILS = env?.adminEmails ?? "";
  process.env.AUTH_EXPERT_EMAILS = env?.expertEmails ?? "";

  return import("./persisted-identity");
}

beforeEach(() => {
  process.env.AUTH_ADMIN_EMAILS = "";
  process.env.AUTH_EXPERT_EMAILS = "";
});

describe("syncPersistedIdentity", () => {
  it("creates the user and profile and seeds bootstrap roles on first sync", async () => {
    const state: StoreState = {
      nextUserId: 0,
      profilesByUserId: {},
      rolesByUserId: {},
      seededRoleCodes: [],
      usersByIdentity: {},
    };
    const store = createIdentityStore(state);
    const { syncPersistedIdentity } = await loadPersistedIdentityModule({
      adminEmails: "ana@example.com",
    });

    const identity = await syncPersistedIdentity(buildSession(), store);

    expect(identity.user).toEqual({
      id: "user-1",
      email: "ana@example.com",
      emailVerifiedAt: null,
    });
    expect(identity.profile).toEqual({
      displayName: "Ana",
      avatarUrl: "https://example.com/avatar.png",
      locale: null,
      timezone: null,
    });
    expect(identity.role).toBe("admin");
    expect(state.seededRoleCodes).toEqual([["user", "admin"]]);
  });

  it("updates name and image without clobbering locale and timezone", async () => {
    const state: StoreState = {
      nextUserId: 0,
      profilesByUserId: {
        "user-1": {
          displayName: "Nombre anterior",
          avatarUrl: "https://example.com/old-avatar.png",
          locale: "es-ES",
          timezone: "Europe/Madrid",
        },
      },
      rolesByUserId: {
        "user-1": ["user"],
      },
      seededRoleCodes: [],
      usersByIdentity: {
        "google:sub_123": {
          id: "user-1",
          email: "ana@example.com",
          emailVerifiedAt: null,
        },
      },
    };
    const store = createIdentityStore(state);
    const { syncPersistedIdentity } = await loadPersistedIdentityModule();

    const identity = await syncPersistedIdentity(
      buildSession({
        image: "https://example.com/new-avatar.png",
        name: "Nombre nuevo",
      }),
      store,
    );

    expect(identity.profile).toEqual({
      displayName: "Nombre nuevo",
      avatarUrl: "https://example.com/new-avatar.png",
      locale: "es-ES",
      timezone: "Europe/Madrid",
    });
    expect(state.seededRoleCodes).toEqual([]);
  });

  it("resolves the highest persisted role and ignores env fallback once rows exist", async () => {
    const state: StoreState = {
      nextUserId: 0,
      profilesByUserId: {},
      rolesByUserId: {
        "user-1": ["user", "expert"],
      },
      seededRoleCodes: [],
      usersByIdentity: {
        "google:sub_123": {
          id: "user-1",
          email: "ana@example.com",
          emailVerifiedAt: null,
        },
      },
    };
    const store = createIdentityStore(state);
    const { syncPersistedIdentity } = await loadPersistedIdentityModule({
      adminEmails: "ana@example.com",
    });

    const identity = await syncPersistedIdentity(buildSession(), store);

    expect(identity.role).toBe("expert");
    expect(state.seededRoleCodes).toEqual([]);
  });

  it("hydrates the session with persisted profile and role values", async () => {
    const state: StoreState = {
      nextUserId: 0,
      profilesByUserId: {},
      rolesByUserId: {},
      seededRoleCodes: [],
      usersByIdentity: {},
    };
    const store = createIdentityStore(state);
    const { hydrateSessionWithPersistedIdentity, syncPersistedIdentity } =
      await loadPersistedIdentityModule({
        expertEmails: "ana@example.com",
      });
    const session = buildSession();
    const identity = await syncPersistedIdentity(session, store);

    expect(
      hydrateSessionWithPersistedIdentity(session, identity),
    ).toMatchObject({
      user: {
        id: "google:sub_123",
        role: "expert",
        email: "ana@example.com",
        name: "Ana",
        image: "https://example.com/avatar.png",
      },
    });
  });
});
