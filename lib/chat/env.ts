import "server-only";

import { z } from "zod";

export const DEFAULT_CHAT_MAX_MESSAGE_CHARS = 4000;

const chatRuntimeEnvSchema = z.object({
  CHAT_MAX_MESSAGE_CHARS: z.coerce
    .number()
    .int()
    .positive()
    .default(DEFAULT_CHAT_MAX_MESSAGE_CHARS),
});

export type ChatRuntimeEnv = {
  maxMessageChars: number;
};

export function parseChatRuntimeEnv(
  input: NodeJS.ProcessEnv | Record<string, string | undefined>,
): ChatRuntimeEnv {
  const env = chatRuntimeEnvSchema.parse(input);

  return {
    maxMessageChars: env.CHAT_MAX_MESSAGE_CHARS,
  };
}

export const chatRuntimeEnv = parseChatRuntimeEnv(process.env);
