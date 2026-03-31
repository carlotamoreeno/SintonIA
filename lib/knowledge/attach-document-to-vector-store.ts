import "server-only";

import { openAIAdapter } from "@/lib/openai/adapter";
import { knowledgeDocumentCatalogStore } from "@/lib/supabase/knowledge-document-store";
import { knowledgeVectorStoreRegistrationStore } from "@/lib/supabase/knowledge-vector-store-registry";
import { createAttachKnowledgeDocumentToVectorStore } from "./attach-document-to-vector-store-core";

export * from "./attach-document-to-vector-store-core";

export const attachKnowledgeDocumentToVectorStore =
  createAttachKnowledgeDocumentToVectorStore({
    catalogStore: knowledgeDocumentCatalogStore,
    openAI: openAIAdapter,
    registryStore: knowledgeVectorStoreRegistrationStore,
  });
