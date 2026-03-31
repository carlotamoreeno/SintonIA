import "server-only";

import { reindexKnowledgeDocument } from "./reindex-knowledge-document";
import { knowledgeDocumentCatalogStore } from "@/lib/supabase/knowledge-document-store";
import { knowledgeVectorStoreRegistrationStore } from "@/lib/supabase/knowledge-vector-store-registry";
import { createReindexKnowledgeDataset } from "./reindex-knowledge-dataset-core";

export * from "./reindex-knowledge-dataset-core";

export const reindexKnowledgeDataset = createReindexKnowledgeDataset({
  catalogStore: knowledgeDocumentCatalogStore,
  registryStore: knowledgeVectorStoreRegistrationStore,
  reindexKnowledgeDocument,
});
