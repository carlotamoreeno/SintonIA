import "server-only";

import { createSupabaseAdminClient } from "./client-core";
import { supabaseServerEnv } from "./env";

export { createSupabaseAdminClient } from "./client-core";
export type {
  SupabaseAdminClient,
  SupabaseAdminClientConfig,
} from "./client-core";

export const supabaseAdmin = createSupabaseAdminClient(supabaseServerEnv);
