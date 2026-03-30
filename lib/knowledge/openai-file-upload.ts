import "server-only";

import { openAIAdapter } from "@/lib/openai/adapter";
import { supabaseAdmin } from "@/lib/supabase/client";
import { knowledgeDocumentCatalogStore } from "@/lib/supabase/knowledge-document-store";
import { createUploadKnowledgeDocumentToOpenAI } from "./openai-file-upload-core";

export * from "./openai-file-upload-core";

export const uploadKnowledgeDocumentToOpenAI =
  createUploadKnowledgeDocumentToOpenAI({
    catalogStore: knowledgeDocumentCatalogStore,
    openAI: openAIAdapter,
    supabase: supabaseAdmin,
  });
