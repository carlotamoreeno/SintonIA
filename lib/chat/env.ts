import "server-only";

import { z } from "zod";
import {
  MAX_CHAT_HISTORY_TURNS,
  MAX_CHAT_MESSAGE_CHARS,
  MAX_CHAT_OUTPUT_TOKENS,
} from "./limits";

export const DEFAULT_CHAT_MAX_MESSAGE_CHARS = MAX_CHAT_MESSAGE_CHARS;
export const DEFAULT_CHAT_MAX_HISTORY_TURNS = MAX_CHAT_HISTORY_TURNS;
export const DEFAULT_CHAT_MAX_OUTPUT_TOKENS = MAX_CHAT_OUTPUT_TOKENS;
export const DEFAULT_CHAT_RATE_LIMIT_PER_MIN = 20;
export const DEFAULT_CHAT_ENABLE_PROMPT_CACHING = false;

const chatRuntimeEnvSchema = z.object({
  CHAT_ENABLE_PROMPT_CACHING: z
    .string()
    .optional()
    .default(String(DEFAULT_CHAT_ENABLE_PROMPT_CACHING)),
  CHAT_MAX_HISTORY_TURNS: z.coerce
    .number()
    .int()
    .positive()
    .max(
      MAX_CHAT_HISTORY_TURNS,
      `CHAT_MAX_HISTORY_TURNS must not exceed ${MAX_CHAT_HISTORY_TURNS}.`,
    )
    .default(DEFAULT_CHAT_MAX_HISTORY_TURNS),
  CHAT_MAX_MESSAGE_CHARS: z.coerce
    .number()
    .int()
    .positive()
    .max(
      MAX_CHAT_MESSAGE_CHARS,
      `CHAT_MAX_MESSAGE_CHARS must not exceed ${MAX_CHAT_MESSAGE_CHARS}.`,
    )
    .default(DEFAULT_CHAT_MAX_MESSAGE_CHARS),
  CHAT_MAX_OUTPUT_TOKENS: z.coerce
    .number()
    .int()
    .positive()
    .max(
      MAX_CHAT_OUTPUT_TOKENS,
      `CHAT_MAX_OUTPUT_TOKENS must not exceed ${MAX_CHAT_OUTPUT_TOKENS}.`,
    )
    .default(DEFAULT_CHAT_MAX_OUTPUT_TOKENS),
  CHAT_RATE_LIMIT_PER_MIN: z.coerce
    .number()
    .int()
    .positive()
    .default(DEFAULT_CHAT_RATE_LIMIT_PER_MIN),
});

export type ChatRuntimeEnv = {
  enablePromptCaching: boolean;
  maxHistoryTurns: number;
  maxMessageChars: number;
  maxOutputTokens: number;
  rateLimitPerMinute: number;
};

function parseChatPromptCachingFlag(value: string) {
  const normalizedValue = value.trim().toLowerCase();

  if (normalizedValue === "true") {
    return true;
  }

  if (normalizedValue === "false") {
    return false;
  }

  throw new Error("CHAT_ENABLE_PROMPT_CACHING must be either true or false.");
}

export function parseChatRuntimeEnv(
  input: NodeJS.ProcessEnv | Record<string, string | undefined>,
): ChatRuntimeEnv {
  const env = chatRuntimeEnvSchema.parse(input);

  return {
    enablePromptCaching: parseChatPromptCachingFlag(
      env.CHAT_ENABLE_PROMPT_CACHING,
    ),
    maxHistoryTurns: env.CHAT_MAX_HISTORY_TURNS,
    maxMessageChars: env.CHAT_MAX_MESSAGE_CHARS,
    maxOutputTokens: env.CHAT_MAX_OUTPUT_TOKENS,
    rateLimitPerMinute: env.CHAT_RATE_LIMIT_PER_MIN,
  };
}

export const chatRuntimeEnv = parseChatRuntimeEnv(process.env);
