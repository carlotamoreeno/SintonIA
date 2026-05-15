import { describe, expect, it, vi } from "vitest";
import {
  createPrivacyDeleteStore,
  PRIVACY_DELETE_SCHEMA_VERSION,
} from "./privacy-delete-store-core";

type PrivacyDeleteClientFixtures = {
  error?: { message: string } | null;
  rows?: unknown[] | null;
};

type CapturedDeleteQuery = {
  deleted: boolean;
  eq: Array<[column: string, value: unknown]>;
  select: string | null;
  table: string;
};

function createPrivacyDeleteClientMock(fixtures: PrivacyDeleteClientFixtures) {
  const capturedQuery: CapturedDeleteQuery = {
    table: "",
    deleted: false,
    eq: [],
    select: null,
  };

  const query = {
    delete: vi.fn(() => {
      capturedQuery.deleted = true;

      return query;
    }),
    eq: vi.fn((column: string, value: unknown) => {
      capturedQuery.eq.push([column, value]);

      return query;
    }),
    select: vi.fn((columns: string) => {
      capturedQuery.select = columns;

      return query;
    }),
    returns: vi.fn(async () => ({
      data: fixtures.rows ?? [],
      error: fixtures.error ?? null,
    })),
  };

  const fromMock = vi.fn((table: string) => {
    capturedQuery.table = table;

    return query;
  });

  return {
    client: {
      from: fromMock,
    },
    capturedQuery,
    fromMock,
    query,
  };
}

describe("createPrivacyDeleteStore", () => {
  it("deletes exactly the requested user row and returns a versioned payload", async () => {
    const { capturedQuery, client, query } = createPrivacyDeleteClientMock({
      rows: [{ id: "user-1" }],
    });
    const store = createPrivacyDeleteStore(client as never);

    const result = await store.deleteUserData({
      userId: "user-1",
      deletedAt: "2026-05-14T10:00:00.000Z",
    });

    expect(capturedQuery).toEqual({
      table: "users",
      deleted: true,
      eq: [["id", "user-1"]],
      select: "id",
    });
    expect(query.returns).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      schemaVersion: PRIVACY_DELETE_SCHEMA_VERSION,
      deletedAt: "2026-05-14T10:00:00.000Z",
      deleted: true,
    });
  });

  it("throws a descriptive error when Supabase rejects the delete", async () => {
    const { client } = createPrivacyDeleteClientMock({
      error: { message: "delete failed" },
    });
    const store = createPrivacyDeleteStore(client as never);

    await expect(
      store.deleteUserData({
        userId: "user-1",
      }),
    ).rejects.toThrow("Failed to delete user privacy data: delete failed");
  });

  it("throws a descriptive error when no user row is deleted", async () => {
    const { client } = createPrivacyDeleteClientMock({
      rows: [],
    });
    const store = createPrivacyDeleteStore(client as never);

    await expect(
      store.deleteUserData({
        userId: "user-missing",
      }),
    ).rejects.toThrow(
      "Failed to delete user privacy data: expected 1 deleted user row for user-missing, got 0",
    );
  });

  it("throws a descriptive error when more than one user row is returned", async () => {
    const { client } = createPrivacyDeleteClientMock({
      rows: [{ id: "user-1" }, { id: "user-1-duplicate" }],
    });
    const store = createPrivacyDeleteStore(client as never);

    await expect(
      store.deleteUserData({
        userId: "user-1",
      }),
    ).rejects.toThrow(
      "Failed to delete user privacy data: expected 1 deleted user row for user-1, got 2",
    );
  });
});
