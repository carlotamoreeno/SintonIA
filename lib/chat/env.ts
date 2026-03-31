import "server-only";

import { z } from "zod";

export const DEFAULT_CHAT_MAX_MESSAGE_CHARS = 4000;
export const DEFAULT_CHAT_MAX_HISTORY_TURNS = 12;
export const DEFAULT_CHAT_MAX_OUTPUT_TOKENS = 800;
export const DEFAULT_CHAT_RATE_LIMIT_PER_MIN = 20;

const chatRuntimeEnvSchema = z.object({
  CHAT_MAX_HISTORY_TURNS: z.coerce
    .number()
    .int()
    .positive()
    .default(DEFAULT_CHAT_MAX_HISTORY_TURNS),
  CHAT_MAX_MESSAGE_CHARS: z.coerce
    .number()
    .int()
    .positive()
    .default(DEFAULT_CHAT_MAX_MESSAGE_CHARS),
  CHAT_MAX_OUTPUT_TOKENS: z.coerce
    .number()
    .int()
    .positive()
    .default(DEFAULT_CHAT_MAX_OUTPUT_TOKENS),
  CHAT_RATE_LIMIT_PER_MIN: z.coerce
    .number()
    .int()
    .positive()
    .default(DEFAULT_CHAT_RATE_LIMIT_PER_MIN),
});

export type ChatRuntimeEnv = {
  maxHistoryTurns: number;
  maxMessageChars: number;
  maxOutputTokens: number;
  rateLimitPerMinute: number;
};

export function parseChatRuntimeEnv(
  input: NodeJS.ProcessEnv | Record<string, string | undefined>,
): ChatRuntimeEnv {
  const env = chatRuntimeEnvSchema.parse(input);

  return {
    maxHistoryTurns: env.CHAT_MAX_HISTORY_TURNS,
    maxMessageChars: env.CHAT_MAX_MESSAGE_CHARS,
    maxOutputTokens: env.CHAT_MAX_OUTPUT_TOKENS,
    rateLimitPerMinute: env.CHAT_RATE_LIMIT_PER_MIN,
  };
}

export const chatRuntimeEnv = parseChatRuntimeEnv(process.env);
