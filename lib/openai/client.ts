import "server-only";

import OpenAI from "openai";
import { openAIServerEnv, type OpenAIServerEnv } from "./env";

export const OPENAI_MAX_RETRIES = 1;

export function createOpenAIClient(env: OpenAIServerEnv) {
  return new OpenAI({
    apiKey: env.apiKey,
    timeout: env.timeoutMs,
    maxRetries: OPENAI_MAX_RETRIES,
  });
}

export type OpenAIClient = ReturnType<typeof createOpenAIClient>;

export const openAIClient = createOpenAIClient(openAIServerEnv);
