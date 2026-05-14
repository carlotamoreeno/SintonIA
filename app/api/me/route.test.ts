import { beforeEach, describe, expect, it, vi } from "vitest";
import { UNAUTHENTICATED_API_MESSAGE } from "@/lib/auth/access";

const PRIVACY_DELETE_SCHEMA_VERSION = "rgpd-delete-v1";

const { deleteUserDataMock, getOptionalAppSessionMock, signOutMock } =
  vi.hoisted(() => ({
    deleteUserDataMock: vi.fn(),
    getOptionalAppSessionMock: vi.fn(),
    signOutMock: vi.fn(),
  }));

vi.mock("@/auth", () => ({
  signOut: signOutMock,
}));

vi.mock("@/lib/auth/app-session", () => ({
  getOptionalAppSession: getOptionalAppSessionMock,
}));

vi.mock("@/lib/supabase/privacy-delete-store", () => ({
  PRIVACY_DELETE_SCHEMA_VERSION,
  privacyDeleteStore: {
    deleteUserData: deleteUserDataMock,
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/me", () => {
  it("returns 401 when there is no authenticated session", async () => {
    getOptionalAppSessionMock.mockResolvedValueOnce(null);

    const { GET } = await import("./route");
    const response = await GET();

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      message: UNAUTHENTICATED_API_MESSAGE,
    });
  });

  it("returns the current authenticated identity payload", async () => {
    getOptionalAppSessionMock.mockResolvedValueOnce({
      session: {
        expires: "2099-01-01T00:00:00.000Z",
        user: {
          id: "google:sub_123",
          role: "expert",
          email: "expert@example.com",
          name: "Expert User",
          image: "https://example.com/avatar.png",
        },
      },
    });

    const { GET } = await import("./route");
    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      id: "google:sub_123",
      role: "expert",
      email: "expert@example.com",
      name: "Expert User",
      image: "https://example.com/avatar.png",
      expires: "2099-01-01T00:00:00.000Z",
    });
  });
});

describe("DELETE /api/me", () => {
  it("returns 401 when there is no authenticated session", async () => {
    getOptionalAppSessionMock.mockResolvedValueOnce(null);

    const { DELETE } = await import("./route");
    const response = await DELETE();

    expect(response.status).toBe(401);
    expect(deleteUserDataMock).not.toHaveBeenCalled();
    expect(signOutMock).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toEqual({
      message: UNAUTHENTICATED_API_MESSAGE,
    });
  });

  it("hard-deletes the current persisted user and expires the session", async () => {
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
    deleteUserDataMock.mockResolvedValueOnce({
      schemaVersion: PRIVACY_DELETE_SCHEMA_VERSION,
      deletedAt: "2026-05-14T10:00:00.000Z",
      deleted: true,
    });
    signOutMock.mockResolvedValueOnce(undefined);

    const { DELETE } = await import("./route");
    const response = await DELETE();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(deleteUserDataMock).toHaveBeenCalledWith({
      userId: "persisted-user-1",
    });
    expect(signOutMock).toHaveBeenCalledWith({
      redirect: false,
      redirectTo: "/",
    });
    await expect(response.json()).resolves.toEqual({
      schemaVersion: PRIVACY_DELETE_SCHEMA_VERSION,
      deletedAt: "2026-05-14T10:00:00.000Z",
      deleted: true,
    });
  });
});
