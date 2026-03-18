import { describe, expect, it, vi } from "vitest";
import { UNAUTHENTICATED_API_MESSAGE } from "@/lib/auth/access";

const authMock = vi.fn();

vi.mock("@/auth", () => ({
  auth: authMock,
}));

describe("GET /api/me", () => {
  it("returns 401 when there is no authenticated session", async () => {
    authMock.mockResolvedValueOnce(null);

    const { GET } = await import("./route");
    const response = await GET();

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      message: UNAUTHENTICATED_API_MESSAGE,
    });
  });

  it("returns the current authenticated identity payload", async () => {
    authMock.mockResolvedValueOnce({
      expires: "2099-01-01T00:00:00.000Z",
      user: {
        id: "google:sub_123",
        role: "expert",
        email: "expert@example.com",
        name: "Expert User",
        image: "https://example.com/avatar.png",
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
