import "server-only";

import { supabaseAdmin } from "./client";
import { createKnowledgeVectorStoreRegistrationStore } from "./knowledge-vector-store-registry-core";

export * from "./knowledge-vector-store-registry-core";

export const knowledgeVectorStoreRegistrationStore =
  createKnowledgeVectorStoreRegistrationStore(supabaseAdmin);
