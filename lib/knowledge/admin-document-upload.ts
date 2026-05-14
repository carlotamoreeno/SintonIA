import "server-only";

import { supabaseAdmin } from "@/lib/supabase/client";
import { knowledgeDocumentCatalogStore } from "@/lib/supabase/knowledge-document-store";
import { attachKnowledgeDocumentToVectorStore } from "./attach-document-to-vector-store";
import { createAdminKnowledgeDocumentUpload } from "./admin-document-upload-core";
import { uploadKnowledgeDocumentToOpenAI } from "./openai-file-upload";

export * from "./admin-document-upload-core";

export const uploadAdminKnowledgeDocument = createAdminKnowledgeDocumentUpload({
  attachToVectorStore: attachKnowledgeDocumentToVectorStore,
  catalogStore: knowledgeDocumentCatalogStore,
  storage: supabaseAdmin,
  uploadToOpenAI: uploadKnowledgeDocumentToOpenAI,
});
