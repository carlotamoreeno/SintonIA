import "server-only";

import { z } from "zod";

const nonEmptyString = z.string().trim().min(1);

const supabaseServerEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z
    .string()
    .trim()
    .url()
    .transform((value) => value.replace(/\/+$/, "")),
  SUPABASE_SERVICE_ROLE_KEY: nonEmptyString,
});

export type SupabaseServerEnv = {
  supabaseUrl: string;
  serviceRoleKey: string;
};

export function parseSupabaseServerEnv(
  input: NodeJS.ProcessEnv | Record<string, string | undefined>,
): SupabaseServerEnv {
  const env = supabaseServerEnvSchema.parse(input);

  return {
    supabaseUrl: env.NEXT_PUBLIC_SUPABASE_URL,
    serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY,
  };
}

export const supabaseServerEnv = parseSupabaseServerEnv(process.env);
