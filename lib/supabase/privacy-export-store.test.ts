import { describe, expect, it, vi } from "vitest";
import {
  createPrivacyExportStore,
  PRIVACY_EXPORT_SCHEMA_VERSION,
} from "./privacy-export-store";

type PrivacyExportClientFixtures = {
  citations?: unknown[];
  consents?: unknown[];
  conversations?: unknown[];
  messages?: unknown[];
  profile?: unknown | null;
  roles?: unknown[];
  user: unknown;
  userRoles?: unknown[];
};

type CapturedQuery = {
  eq: Array<[column: string, value: unknown]>;
  in: Array<[column: string, values: unknown[]]>;
  order: Array<[column: string, options: unknown]>;
  select: string | null;
  table: string;
};

function createPrivacyExportClientMock(fixtures: PrivacyExportClientFixtures) {
  const queries: CapturedQuery[] = [];

  const resolveRows = (table: string) => {
    if (table === "user_roles") {
      return fixtures.userRoles ?? [];
    }

    if (table === "roles") {
      return fixtures.roles ?? [];
    }

    if (table === "conversations") {
      return fixtures.conversations ?? [];
    }

    if (table === "messages") {
      return fixtures.messages ?? [];
    }

    if (table === "message_citations") {
      return fixtures.citations ?? [];
    }

    if (table === "consents") {
      return fixtures.consents ?? [];
    }

    throw new Error(`Unexpected returns() for table ${table}`);
  };

  const fromMock = vi.fn((table: string) => {
    const capturedQuery: CapturedQuery = {
      table,
      select: null,
      eq: [],
      in: [],
      order: [],
    };
    queries.push(capturedQuery);

    const query = {
      select: vi.fn((columns: string) => {
        capturedQuery.select = columns;

        return query;
      }),
      eq: vi.fn((column: string, value: unknown) => {
        capturedQuery.eq.push([column, value]);

        return query;
      }),
      in: vi.fn((column: string, values: unknown[]) => {
        capturedQuery.in.push([column, values]);

        return query;
      }),
      order: vi.fn((column: string, options: unknown) => {
        capturedQuery.order.push([column, options]);

        return query;
      }),
      single: vi.fn(async () => {
        if (table !== "users") {
          throw new Error(`Unexpected single() for table ${table}`);
        }

        return {
          data: fixtures.user,
          error: null,
        };
      }),
      maybeSingle: vi.fn(async () => {
        if (table !== "profiles") {
          throw new Error(`Unexpected maybeSingle() for table ${table}`);
        }

        return {
          data: fixtures.profile ?? null,
          error: null,
        };
      }),
      returns: vi.fn(async () => ({
        data: resolveRows(table),
        error: null,
      })),
    };

    return query;
  });

  return {
    client: {
      from: fromMock,
    },
    fromMock,
    queries,
  };
}

const baseUser = {
  id: "user-1",
  auth_provider: "google",
  auth_subject: "sub_123",
  email: "user@example.com",
  email_verified_at: "2026-03-18T10:00:00.000Z",
  created_at: "2026-03-18T10:00:00.000Z",
  updated_at: "2026-05-14T08:00:00.000Z",
};

describe("createPrivacyExportStore", () => {
  it("exports profile, roles, conversations, messages, citations and consents for one user", async () => {
    const { client, queries } = createPrivacyExportClientMock({
      user: baseUser,
      profile: {
        display_name: "Usuario Export",
        avatar_url: "https://example.com/avatar.png",
        locale: "es-ES",
        timezone: "Europe/Madrid",
        created_at: "2026-03-18T10:01:00.000Z",
        updated_at: "2026-05-14T08:01:00.000Z",
      },
      userRoles: [{ role_id: "role-admin" }, { role_id: "role-user" }],
      roles: [
        { id: "role-admin", code: "admin" },
        { id: "role-user", code: "user" },
      ],
      conversations: [
        {
          id: "conversation-new",
          title: "Consulta nueva",
          status: "active",
          created_at: "2026-05-14T08:05:00.000Z",
          updated_at: "2026-05-14T08:07:00.000Z",
          last_message_at: "2026-05-14T08:07:00.000Z",
        },
        {
          id: "conversation-old",
          title: "Consulta antigua",
          status: "active",
          created_at: "2026-05-13T08:00:00.000Z",
          updated_at: "2026-05-13T08:01:00.000Z",
          last_message_at: "2026-05-13T08:01:00.000Z",
        },
      ],
      messages: [
        {
          id: "message-old-user",
          conversation_id: "conversation-old",
          role: "user",
          content: "Mensaje antiguo",
          provider_message_id: null,
          created_at: "2026-05-13T08:00:00.000Z",
        },
        {
          id: "message-new-user",
          conversation_id: "conversation-new",
          role: "user",
          content: "Pregunta documentada",
          provider_message_id: null,
          created_at: "2026-05-14T08:05:00.000Z",
        },
        {
          id: "message-new-assistant",
          conversation_id: "conversation-new",
          role: "assistant",
          content: "Respuesta con cita",
          provider_message_id: "resp_123",
          created_at: "2026-05-14T08:06:00.000Z",
        },
      ],
      citations: [
        {
          message_id: "message-new-assistant",
          citation_index: 0,
          document_id: "botanica-mvp-v1-corpus-mvp",
          document_name: "Corpus MVP botánico",
          snippet: "Fragmento citado",
          file_id: "file-1",
          vector_store_id: "vs_active_123",
        },
      ],
      consents: [
        {
          id: "consent-1",
          consent_type: "terms",
          status: "granted",
          granted_at: "2026-03-18T10:00:00.000Z",
          revoked_at: null,
          source: "oauth",
          created_at: "2026-03-18T10:00:00.000Z",
          updated_at: "2026-03-18T10:00:00.000Z",
        },
      ],
    });
    const store = createPrivacyExportStore(client as never);

    const result = await store.exportUserData({
      userId: "user-1",
      exportedAt: "2026-05-14T09:00:00.000Z",
    });

    expect(result).toEqual({
      schemaVersion: PRIVACY_EXPORT_SCHEMA_VERSION,
      exportedAt: "2026-05-14T09:00:00.000Z",
      subject: {
        id: "google:sub_123",
        persistedUserId: "user-1",
        authProvider: "google",
        authSubject: "sub_123",
        email: "user@example.com",
        emailVerifiedAt: "2026-03-18T10:00:00.000Z",
        createdAt: "2026-03-18T10:00:00.000Z",
        updatedAt: "2026-05-14T08:00:00.000Z",
      },
      profile: {
        displayName: "Usuario Export",
        avatarUrl: "https://example.com/avatar.png",
        locale: "es-ES",
        timezone: "Europe/Madrid",
        createdAt: "2026-03-18T10:01:00.000Z",
        updatedAt: "2026-05-14T08:01:00.000Z",
      },
      roles: ["user", "admin"],
      conversations: [
        {
          id: "conversation-new",
          title: "Consulta nueva",
          status: "active",
          createdAt: "2026-05-14T08:05:00.000Z",
          updatedAt: "2026-05-14T08:07:00.000Z",
          lastMessageAt: "2026-05-14T08:07:00.000Z",
          messages: [
            {
              id: "message-new-user",
              role: "user",
              content: "Pregunta documentada",
              providerMessageId: null,
              createdAt: "2026-05-14T08:05:00.000Z",
              grounded: false,
              citations: [],
            },
            {
              id: "message-new-assistant",
              role: "assistant",
              content: "Respuesta con cita",
              providerMessageId: "resp_123",
              createdAt: "2026-05-14T08:06:00.000Z",
              grounded: true,
              citations: [
                {
                  citationIndex: 0,
                  documentId: "botanica-mvp-v1-corpus-mvp",
                  documentName: "Corpus MVP botánico",
                  snippet: "Fragmento citado",
                  fileId: "file-1",
                  vectorStoreId: "vs_active_123",
                },
              ],
            },
          ],
        },
        {
          id: "conversation-old",
          title: "Consulta antigua",
          status: "active",
          createdAt: "2026-05-13T08:00:00.000Z",
          updatedAt: "2026-05-13T08:01:00.000Z",
          lastMessageAt: "2026-05-13T08:01:00.000Z",
          messages: [
            {
              id: "message-old-user",
              role: "user",
              content: "Mensaje antiguo",
              providerMessageId: null,
              createdAt: "2026-05-13T08:00:00.000Z",
              grounded: false,
              citations: [],
            },
          ],
        },
      ],
      consents: [
        {
          id: "consent-1",
          consentType: "terms",
          status: "granted",
          grantedAt: "2026-03-18T10:00:00.000Z",
          revokedAt: null,
          source: "oauth",
          createdAt: "2026-03-18T10:00:00.000Z",
          updatedAt: "2026-03-18T10:00:00.000Z",
        },
      ],
    });

    expect(queries.find((query) => query.table === "users")?.eq).toEqual([
      ["id", "user-1"],
    ]);
    for (const table of [
      "profiles",
      "user_roles",
      "conversations",
      "messages",
      "consents",
    ]) {
      expect(queries.find((query) => query.table === table)?.eq).toEqual([
        ["user_id", "user-1"],
      ]);
    }
    expect(queries.find((query) => query.table === "roles")?.in).toEqual([
      ["id", ["role-admin", "role-user"]],
    ]);
    expect(
      queries.find((query) => query.table === "message_citations")?.in,
    ).toEqual([
      [
        "message_id",
        ["message-old-user", "message-new-user", "message-new-assistant"],
      ],
    ]);
  });

  it("returns empty collections and nullable profile fields when the user has no exported activity", async () => {
    const { client, fromMock } = createPrivacyExportClientMock({
      user: baseUser,
      profile: null,
      userRoles: [],
      conversations: [],
      messages: [],
      consents: [],
    });
    const store = createPrivacyExportStore(client as never);

    const result = await store.exportUserData({
      userId: "user-1",
      exportedAt: "2026-05-14T09:00:00.000Z",
    });

    expect(result.profile).toEqual({
      avatarUrl: null,
      createdAt: null,
      displayName: null,
      locale: null,
      timezone: null,
      updatedAt: null,
    });
    expect(result.roles).toEqual([]);
    expect(result.conversations).toEqual([]);
    expect(result.consents).toEqual([]);
    expect(fromMock).not.toHaveBeenCalledWith("roles");
    expect(fromMock).not.toHaveBeenCalledWith("message_citations");
  });
});
