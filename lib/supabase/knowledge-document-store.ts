import "server-only";

import { z } from "zod";
import { supabaseAdmin, type SupabaseAdminClient } from "./client";

const knowledgeDocumentCatalogRowSchema = z.object({
  canonical_path: z.string().min(1),
  created_at: z.string().datetime({ offset: true }),
  dataset_version: z.string().min(1),
  doc_id: z.string().min(1),
  document_version: z.number().int().positive(),
  id: z.string().min(1),
  sha256: z.string().min(1),
  status: z.string().min(1),
  title: z.string().min(1),
});

type KnowledgeDocumentCatalogRow = z.infer<
  typeof knowledgeDocumentCatalogRowSchema
>;

type KnowledgeDocumentCatalogStoreClient = Pick<SupabaseAdminClient, "from">;

export type ExistingKnowledgeDocument = {
  canonicalPath: string;
  createdAt: string;
  datasetVersion: string;
  docId: string;
  documentVersion: number;
  id: string;
  sha256: string;
  status: string;
  title: string;
};

export type KnowledgeDocumentCatalogStore = {
  findFirstDocumentBySha256(
    sha256: string,
  ): Promise<ExistingKnowledgeDocument | null>;
};

function mapExistingKnowledgeDocument(
  row: KnowledgeDocumentCatalogRow,
): ExistingKnowledgeDocument {
  return {
    id: row.id,
    docId: row.doc_id,
    title: row.title,
    documentVersion: row.document_version,
    datasetVersion: row.dataset_version,
    canonicalPath: row.canonical_path,
    sha256: row.sha256,
    status: row.status,
    createdAt: row.created_at,
  };
}

export function createKnowledgeDocumentCatalogStore(
  client: KnowledgeDocumentCatalogStoreClient = supabaseAdmin,
): KnowledgeDocumentCatalogStore {
  return {
    async findFirstDocumentBySha256(sha256) {
      const { data, error } = await client
        .from("knowledge_documents")
        .select(
          "id, doc_id, title, document_version, dataset_version, canonical_path, sha256, status, created_at",
        )
        .eq("sha256", sha256)
        .order("created_at", {
          ascending: true,
        })
        .limit(1)
        .returns<KnowledgeDocumentCatalogRow[]>();

      if (error) {
        throw new Error(
          `Failed to load knowledge document duplicates: ${error.message}`,
        );
      }

      const row = knowledgeDocumentCatalogRowSchema
        .array()
        .parse(data ?? [])[0];

      return row ? mapExistingKnowledgeDocument(row) : null;
    },
  };
}

export const knowledgeDocumentCatalogStore =
  createKnowledgeDocumentCatalogStore();
