import "server-only";

import { openAIAdapter } from "@/lib/openai/adapter";
import { knowledgeVectorStoreRegistrationStore } from "@/lib/supabase/knowledge-vector-store-registry";
import { createCreateOrRegisterVectorStoreForDataset } from "./create-vector-store-for-dataset-core";

export * from "./create-vector-store-for-dataset-core";

export const createOrRegisterVectorStoreForDataset =
  createCreateOrRegisterVectorStoreForDataset({
    openAI: openAIAdapter,
    registryStore: knowledgeVectorStoreRegistrationStore,
  });
