import { createClient } from "@supabase/supabase-js";

export type SupabaseAdminClientConfig = {
  serviceRoleKey: string;
  supabaseUrl: string;
};

export function createSupabaseAdminClient(env: SupabaseAdminClientConfig) {
  return createClient(env.supabaseUrl, env.serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

export type SupabaseAdminClient = ReturnType<typeof createSupabaseAdminClient>;
