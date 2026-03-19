import { describe, expect, it } from "vitest";
import { parseSupabaseServerEnv } from "./env";

describe("parseSupabaseServerEnv", () => {
  it("normalizes the Supabase URL and reads the service role key", () => {
    expect(
      parseSupabaseServerEnv({
        NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co/",
        SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
      }),
    ).toEqual({
      supabaseUrl: "https://example.supabase.co",
      serviceRoleKey: "service-role-key",
    });
  });

  it("rejects missing required values", () => {
    expect(() =>
      parseSupabaseServerEnv({
        NEXT_PUBLIC_SUPABASE_URL: "",
        SUPABASE_SERVICE_ROLE_KEY: "",
      }),
    ).toThrowError(/NEXT_PUBLIC_SUPABASE_URL|SUPABASE_SERVICE_ROLE_KEY/i);
  });
});
