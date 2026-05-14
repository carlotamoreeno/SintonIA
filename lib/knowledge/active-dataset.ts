import "server-only";

import { knowledgeVectorStoreRegistrationStore } from "@/lib/supabase/knowledge-vector-store-registry";
import { activeDatasetEnv } from "./active-dataset-env";
import { createActiveKnowledgeDatasetResolver } from "./active-dataset-core";

export * from "./active-dataset-core";

export const activeKnowledgeDatasetResolver =
  createActiveKnowledgeDatasetResolver({
    fallbackDatasetVersion: activeDatasetEnv.fallbackDatasetVersion,
    registryStore: knowledgeVectorStoreRegistrationStore,
  });
