import "server-only";

import { createClient } from "@supabase/supabase-js";
import { supabaseServerEnv, type SupabaseServerEnv } from "./env";

export function createSupabaseAdminClient(env: SupabaseServerEnv) {
  return createClient(env.supabaseUrl, env.serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

export type SupabaseAdminClient = ReturnType<typeof createSupabaseAdminClient>;

export const supabaseAdmin = createSupabaseAdminClient(supabaseServerEnv);
