import "server-only";

import { z } from "zod";

const nonEmptyString = z.string().trim().min(1);

export const DEFAULT_OPENAI_TIMEOUT_MS = 30000;

const openAIServerEnvSchema = z.object({
  OPENAI_API_KEY: nonEmptyString,
  OPENAI_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(DEFAULT_OPENAI_TIMEOUT_MS),
});

export type OpenAIServerEnv = {
  apiKey: string;
  timeoutMs: number;
};

export function parseOpenAIServerEnv(
  input: NodeJS.ProcessEnv | Record<string, string | undefined>,
): OpenAIServerEnv {
  const env = openAIServerEnvSchema.parse(input);

  return {
    apiKey: env.OPENAI_API_KEY,
    timeoutMs: env.OPENAI_TIMEOUT_MS,
  };
}

export const openAIServerEnv = parseOpenAIServerEnv(process.env);
