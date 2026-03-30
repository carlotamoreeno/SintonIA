import "server-only";

import { supabaseAdmin } from "./client";
import { createKnowledgeDocumentCatalogStore } from "./knowledge-document-store-core";

export * from "./knowledge-document-store-core";

export const knowledgeDocumentCatalogStore =
  createKnowledgeDocumentCatalogStore(supabaseAdmin);
