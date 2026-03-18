import "server-only";

import { z } from "zod";
import { parseRoleEmailList, type RoleAllowlist } from "@/lib/auth/roles";

const nonEmptyString = z.string().trim().min(1);

const authEnvSchema = z.object({
  APP_BASE_URL: z
    .string()
    .trim()
    .url()
    .transform((value) => value.replace(/\/+$/, "")),
  AUTH_SECRET: nonEmptyString,
  AUTH_TRUST_HOST: z.stringbool(),
  AUTH_GOOGLE_ID: nonEmptyString,
  AUTH_GOOGLE_SECRET: nonEmptyString,
  AUTH_EXPERT_EMAILS: z.string().optional().default(""),
  AUTH_ADMIN_EMAILS: z.string().optional().default(""),
});

export type AuthEnv = {
  appBaseUrl: string;
  authSecret: string;
  authTrustHost: boolean;
  authGoogleId: string;
  authGoogleSecret: string;
} & RoleAllowlist;

export function parseAuthEnv(
  input: NodeJS.ProcessEnv | Record<string, string | undefined>,
): AuthEnv {
  const env = authEnvSchema.parse(input);

  return {
    appBaseUrl: env.APP_BASE_URL,
    authSecret: env.AUTH_SECRET,
    authTrustHost: env.AUTH_TRUST_HOST,
    authGoogleId: env.AUTH_GOOGLE_ID,
    authGoogleSecret: env.AUTH_GOOGLE_SECRET,
    expertEmails: parseRoleEmailList(env.AUTH_EXPERT_EMAILS),
    adminEmails: parseRoleEmailList(env.AUTH_ADMIN_EMAILS),
  };
}

export const authEnv = parseAuthEnv(process.env);
