import "server-only";

import { openAIAdapter } from "@/lib/openai/adapter";
import { openAIServerEnv } from "@/lib/openai/env";
import { conversationStore } from "@/lib/supabase/conversation-store";
import { createCreateChatResponse } from "./create-chat-response-core";

export * from "./create-chat-response-core";

export const createChatResponse = createCreateChatResponse({
  conversationStore,
  model: openAIServerEnv.model,
  openAI: openAIAdapter,
});
