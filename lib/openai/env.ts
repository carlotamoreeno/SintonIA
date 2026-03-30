import "server-only";

import { z } from "zod";

const nonEmptyString = z.string().trim().min(1);

export const DEFAULT_OPENAI_MODEL = "gpt-5-nano";
export const DEFAULT_OPENAI_TIMEOUT_MS = 30000;

const openAIServerEnvSchema = z.object({
  OPENAI_API_KEY: nonEmptyString,
  OPENAI_ACTIVE_VECTOR_STORE_ID: nonEmptyString,
  OPENAI_MODEL: nonEmptyString.default(DEFAULT_OPENAI_MODEL),
  OPENAI_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(DEFAULT_OPENAI_TIMEOUT_MS),
});

export type OpenAIServerEnv = {
  activeVectorStoreId: string;
  apiKey: string;
  model: string;
  timeoutMs: number;
};

export function parseOpenAIServerEnv(
  input: NodeJS.ProcessEnv | Record<string, string | undefined>,
): OpenAIServerEnv {
  const env = openAIServerEnvSchema.parse(input);

  return {
    activeVectorStoreId: env.OPENAI_ACTIVE_VECTOR_STORE_ID,
    apiKey: env.OPENAI_API_KEY,
    model: env.OPENAI_MODEL,
    timeoutMs: env.OPENAI_TIMEOUT_MS,
  };
}

export const openAIServerEnv = parseOpenAIServerEnv(process.env);
