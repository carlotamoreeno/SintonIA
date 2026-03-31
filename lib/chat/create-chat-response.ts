import "server-only";

import { openAIAdapter } from "@/lib/openai/adapter";
import { openAIServerEnv } from "@/lib/openai/env";
import { conversationStore } from "@/lib/supabase/conversation-store";
import { chatRuntimeEnv } from "./env";
import { createCreateChatResponse } from "./create-chat-response-core";

export * from "./create-chat-response-core";

export const createChatResponse = createCreateChatResponse({
  activeVectorStoreId: openAIServerEnv.activeVectorStoreId,
  conversationStore,
  maxHistoryTurns: chatRuntimeEnv.maxHistoryTurns,
  maxOutputTokens: chatRuntimeEnv.maxOutputTokens,
  model: openAIServerEnv.model,
  openAI: openAIAdapter,
});
