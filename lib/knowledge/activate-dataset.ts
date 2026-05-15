import "server-only";

import { openAIAdapter } from "@/lib/openai/adapter";
import { knowledgeVectorStoreRegistrationStore } from "@/lib/supabase/knowledge-vector-store-registry";
import { createActivateKnowledgeDataset } from "./activate-dataset-core";

export * from "./activate-dataset-core";

export const activateKnowledgeDataset = createActivateKnowledgeDataset({
  openAI: openAIAdapter,
  registryStore: knowledgeVectorStoreRegistrationStore,
});
