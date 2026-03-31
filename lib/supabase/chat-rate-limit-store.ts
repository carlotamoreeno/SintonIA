import "server-only";

import { supabaseAdmin } from "./client";
import { createChatRateLimitStore } from "./chat-rate-limit-store-core";

export * from "./chat-rate-limit-store-core";

export const chatRateLimitStore = createChatRateLimitStore(supabaseAdmin);
