import OpenAI from "openai";

export type OpenAIClientConfig = {
  apiKey: string;
  timeoutMs: number;
};

export const OPENAI_MAX_RETRIES = 1;

export function createOpenAIClient(env: OpenAIClientConfig) {
  return new OpenAI({
    apiKey: env.apiKey,
    timeout: env.timeoutMs,
    maxRetries: OPENAI_MAX_RETRIES,
  });
}

export type OpenAIClient = ReturnType<typeof createOpenAIClient>;
