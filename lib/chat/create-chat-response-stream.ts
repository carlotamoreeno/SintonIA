import "server-only";

import { activeKnowledgeDatasetResolver } from "@/lib/knowledge/active-dataset";
import { openAIAdapter } from "@/lib/openai/adapter";
import { openAIServerEnv } from "@/lib/openai/env";
import { knowledgeDocumentCatalogStore } from "@/lib/supabase/knowledge-document-store";
import { conversationStore } from "@/lib/supabase/conversation-store";
import { chatRuntimeEnv } from "./env";
import { createCreateChatResponseStream } from "./create-chat-response-stream-core";

export * from "./create-chat-response-stream-core";

export const createChatResponseStream = createCreateChatResponseStream({
  activeDatasetResolver: activeKnowledgeDatasetResolver,
  catalogStore: knowledgeDocumentCatalogStore,
  conversationStore,
  enablePromptCaching: chatRuntimeEnv.enablePromptCaching,
  maxHistoryTurns: chatRuntimeEnv.maxHistoryTurns,
  maxOutputTokens: chatRuntimeEnv.maxOutputTokens,
  model: openAIServerEnv.model,
  openAI: openAIAdapter,
});
