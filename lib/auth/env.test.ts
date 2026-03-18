import { describe, expect, it } from "vitest";
import { parseAuthEnv } from "./env";

describe("parseAuthEnv", () => {
  it("normalizes auth env values and role allowlists", () => {
    expect(
      parseAuthEnv({
        APP_BASE_URL: "https://example.com/",
        AUTH_SECRET: "secret-value",
        AUTH_TRUST_HOST: "true",
        AUTH_GOOGLE_ID: "google-id",
        AUTH_GOOGLE_SECRET: "google-secret",
        AUTH_EXPERT_EMAILS:
          " Expert@example.com,expert@example.com, second@example.com ",
        AUTH_ADMIN_EMAILS: " Admin@example.com ",
      }),
    ).toEqual({
      appBaseUrl: "https://example.com",
      authSecret: "secret-value",
      authTrustHost: true,
      authGoogleId: "google-id",
      authGoogleSecret: "google-secret",
      expertEmails: ["expert@example.com", "second@example.com"],
      adminEmails: ["admin@example.com"],
    });
  });

  it("rejects missing required auth secrets", () => {
    expect(() =>
      parseAuthEnv({
        APP_BASE_URL: "https://example.com",
        AUTH_SECRET: "",
        AUTH_TRUST_HOST: "true",
        AUTH_GOOGLE_ID: "google-id",
        AUTH_GOOGLE_SECRET: "google-secret",
      }),
    ).toThrowError(/AUTH_SECRET/i);
  });
});
