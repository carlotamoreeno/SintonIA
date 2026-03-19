import { describe, expect, it, vi } from "vitest";

const createClientMock = vi.fn(() => ({
  from: vi.fn(),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: createClientMock,
}));

describe("createSupabaseAdminClient", () => {
  it("creates a service-role client with server-safe auth settings", async () => {
    const { createSupabaseAdminClient } = await import("./client");

    const client = createSupabaseAdminClient({
      supabaseUrl: "https://example.supabase.co",
      serviceRoleKey: "service-role-key",
    });

    expect(client).toEqual({
      from: expect.any(Function),
    });
    expect(createClientMock).toHaveBeenCalledWith(
      "https://example.supabase.co",
      "service-role-key",
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
      },
    );
  });
});
