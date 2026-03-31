import { z } from "zod";
import type { SupabaseAdminClient } from "./client-core";

const consumeChatRateLimitRowSchema = z.object({
  allowed: z.boolean(),
  remaining: z.number().int().nonnegative(),
  request_count: z.number().int().nonnegative(),
  window_start: z.string().datetime({ offset: true }),
});

export type ChatRateLimitConsumeResult = {
  allowed: boolean;
  remaining: number;
  requestCount: number;
  windowStart: string;
};

export type ChatRateLimitStoreClient = Pick<SupabaseAdminClient, "rpc">;

export type ChatRateLimitStore = {
  consumeRequest(input: {
    limit: number;
    now?: string;
    userId: string;
  }): Promise<ChatRateLimitConsumeResult>;
};

export function createChatRateLimitStore(
  client: ChatRateLimitStoreClient,
): ChatRateLimitStore {
  return {
    async consumeRequest(input) {
      const { data, error } = await client
        .rpc("consume_chat_rate_limit", {
          p_limit: input.limit,
          p_now: input.now,
          p_user_id: input.userId,
        })
        .single();

      if (error || !data) {
        throw new Error(`Failed to consume chat rate limit: ${error?.message}`);
      }

      const row = consumeChatRateLimitRowSchema.parse(data);

      return {
        allowed: row.allowed,
        remaining: row.remaining,
        requestCount: row.request_count,
        windowStart: row.window_start,
      };
    },
  };
}
