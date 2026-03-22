import type { Session } from "next-auth";
import type { JWT } from "next-auth/jwt";
import { describe, expect, it } from "vitest";
import { buildAppUserId, parseAppUserId } from "@/lib/auth/identity";
import {
  applyJwtSessionClaims,
  applySessionUserClaims,
  authConfig,
} from "./config";

describe("buildAppUserId", () => {
  it("exposes the custom app-owned sign-in page", () => {
    expect(authConfig.pages?.signIn).toBe("/sign-in");
  });

  it("derives a stable app user id from provider and subject", () => {
    expect(buildAppUserId("google", "sub_123")).toBe("google:sub_123");
  });

  it("parses the provider and subject from the stable app user id", () => {
    expect(parseAppUserId("google:sub_123")).toEqual({
      provider: "google",
      authSubject: "sub_123",
    });
    expect(parseAppUserId("invalid-user-id")).toBeNull();
  });
});

describe("applyJwtSessionClaims", () => {
  it("stores provider claims from the Google subject", async () => {
    const token = await applyJwtSessionClaims({
      token: {} as JWT,
      account: {
        provider: "google",
        providerAccountId: "sub_123",
      },
      profile: {
        sub: "sub_123",
      },
      user: {
        email: "ana@example.com",
      },
    });

    expect(token.provider).toBe("google");
    expect(token.authSubject).toBe("sub_123");
    expect(token.appUserId).toBe("google:sub_123");
    expect(token.email).toBe("ana@example.com");
    expect(token.emailVerified).toBe(false);
    expect(token.role).toBe("user");
  });

  it("keeps the provider email verification signal when present", async () => {
    const token = await applyJwtSessionClaims({
      token: {} as JWT,
      account: {
        provider: "google",
        providerAccountId: "sub_123",
      },
      profile: {
        sub: "sub_123",
        email_verified: true,
      },
      user: {
        email: "ana@example.com",
      },
    });

    expect(token.emailVerified).toBe(true);
  });

  it("falls back to the existing token subject when the provider callback is absent", async () => {
    const token = await applyJwtSessionClaims({
      token: {
        sub: "sub_456",
      } as JWT,
    });

    expect(token.provider).toBe("google");
    expect(token.authSubject).toBe("sub_456");
    expect(token.appUserId).toBe("google:sub_456");
    expect(token.role).toBe("user");
  });
});

describe("applySessionUserClaims", () => {
  it("exposes the stable app user id on session.user", async () => {
    const session = await applySessionUserClaims({
      session: {
        expires: "2099-01-01T00:00:00.000Z",
        user: {
          name: null,
          email: null,
          image: null,
        },
      } as Session,
      token: {
        appUserId: "google:sub_789",
        email: "ana@example.com",
        name: "Ana",
        picture: "https://example.com/avatar.png",
      } as JWT,
    });

    expect(session.user.id).toBe("google:sub_789");
    expect(session.user.role).toBe("user");
    expect(session.user.email).toBe("ana@example.com");
    expect(session.user.emailVerified).toBe(false);
    expect(session.user.name).toBe("Ana");
    expect(session.user.image).toBe("https://example.com/avatar.png");
  });
});
