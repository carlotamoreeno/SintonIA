import "server-only";

import { openAIAdapter } from "@/lib/openai/adapter";
import { openAIServerEnv } from "@/lib/openai/env";
import { knowledgeDocumentCatalogStore } from "@/lib/supabase/knowledge-document-store";
import { conversationStore } from "@/lib/supabase/conversation-store";
import { chatRuntimeEnv } from "./env";
import { createCreateChatResponseStream } from "./create-chat-response-stream-core";

export * from "./create-chat-response-stream-core";

export const createChatResponseStream = createCreateChatResponseStream({
  activeVectorStoreId: openAIServerEnv.activeVectorStoreId,
  catalogStore: knowledgeDocumentCatalogStore,
  conversationStore,
  enablePromptCaching: chatRuntimeEnv.enablePromptCaching,
  maxHistoryTurns: chatRuntimeEnv.maxHistoryTurns,
  maxOutputTokens: chatRuntimeEnv.maxOutputTokens,
  model: openAIServerEnv.model,
  openAI: openAIAdapter,
});
