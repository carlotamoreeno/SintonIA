import "server-only";

import { openAIAdapter } from "@/lib/openai/adapter";
import { knowledgeDocumentCatalogStore } from "@/lib/supabase/knowledge-document-store";
import { knowledgeVectorStoreRegistrationStore } from "@/lib/supabase/knowledge-vector-store-registry";
import { attachKnowledgeDocumentToVectorStore } from "./attach-document-to-vector-store";
import { createReindexKnowledgeDocument } from "./reindex-knowledge-document-core";

export * from "./reindex-knowledge-document-core";

export const reindexKnowledgeDocument = createReindexKnowledgeDocument({
  attachKnowledgeDocumentToVectorStore,
  catalogStore: knowledgeDocumentCatalogStore,
  openAI: openAIAdapter,
  registryStore: knowledgeVectorStoreRegistrationStore,
});
