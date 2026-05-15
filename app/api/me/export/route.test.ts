import { describe, expect, it, vi } from "vitest";
import { UNAUTHENTICATED_API_MESSAGE } from "@/lib/auth/access";

const PRIVACY_EXPORT_SCHEMA_VERSION = "rgpd-export-v1";

const { exportUserDataMock, getOptionalAppSessionMock } = vi.hoisted(() => ({
  exportUserDataMock: vi.fn(),
  getOptionalAppSessionMock: vi.fn(),
}));

vi.mock("@/lib/auth/app-session", () => ({
  getOptionalAppSession: getOptionalAppSessionMock,
}));

vi.mock("@/lib/supabase/privacy-export-store", () => ({
  PRIVACY_EXPORT_SCHEMA_VERSION,
  privacyExportStore: {
    exportUserData: exportUserDataMock,
  },
}));

describe("GET /api/me/export", () => {
  it("returns 401 when there is no authenticated session", async () => {
    getOptionalAppSessionMock.mockResolvedValueOnce(null);

    const { GET } = await import("./route");
    const response = await GET();

    expect(response.status).toBe(401);
    expect(exportUserDataMock).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toEqual({
      message: UNAUTHENTICATED_API_MESSAGE,
    });
  });

  it("returns the authenticated user's versioned privacy export", async () => {
    getOptionalAppSessionMock.mockResolvedValueOnce({
      persistedIdentity: {
        user: {
          id: "persisted-user-1",
        },
      },
      session: {
        expires: "2099-01-01T00:00:00.000Z",
        user: {
          id: "google:sub_123",
          role: "user",
          email: "user@example.com",
          name: "User",
          image: null,
        },
      },
    });
    exportUserDataMock.mockResolvedValueOnce({
      schemaVersion: PRIVACY_EXPORT_SCHEMA_VERSION,
      exportedAt: "2026-05-14T08:00:00.000Z",
      subject: {
        id: "google:sub_123",
        persistedUserId: "persisted-user-1",
        authProvider: "google",
        authSubject: "sub_123",
        email: "user@example.com",
        emailVerifiedAt: "2026-03-18T10:00:00.000Z",
        createdAt: "2026-03-18T10:00:00.000Z",
        updatedAt: "2026-05-14T08:00:00.000Z",
      },
      profile: {
        avatarUrl: null,
        createdAt: null,
        displayName: null,
        locale: null,
        timezone: null,
        updatedAt: null,
      },
      roles: ["user"],
      conversations: [],
      consents: [],
    });

    const { GET } = await import("./route");
    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(exportUserDataMock).toHaveBeenCalledWith({
      userId: "persisted-user-1",
    });
    await expect(response.json()).resolves.toMatchObject({
      schemaVersion: PRIVACY_EXPORT_SCHEMA_VERSION,
      subject: {
        id: "google:sub_123",
        persistedUserId: "persisted-user-1",
      },
      conversations: [],
      consents: [],
    });
  });
});
