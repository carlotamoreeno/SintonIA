import "server-only";

import { z } from "zod";
import { supabaseAdmin, type SupabaseAdminClient } from "./client";

const existingKnowledgeDocumentCatalogRowSchema = z.object({
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

const knowledgeDocumentCatalogDocumentRowSchema =
  existingKnowledgeDocumentCatalogRowSchema.extend({
    custom_metadata_json: z.record(z.string(), z.unknown()),
    last_error: z.string().nullable(),
    last_indexed_at: z.string().datetime({ offset: true }).nullable(),
    mime_type: z.string().min(1),
    openai_file_id: z.string().min(1).nullable(),
    original_filename: z.string().min(1),
    updated_at: z.string().datetime({ offset: true }),
    vector_store_id: z.string().min(1).nullable(),
  });

type ExistingKnowledgeDocumentCatalogRow = z.infer<
  typeof existingKnowledgeDocumentCatalogRowSchema
>;

type KnowledgeDocumentCatalogDocumentRow = z.infer<
  typeof knowledgeDocumentCatalogDocumentRowSchema
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

export type KnowledgeDocumentCatalogDocument = ExistingKnowledgeDocument & {
  customMetadata: Record<string, unknown>;
  lastError: string | null;
  lastIndexedAt: string | null;
  mimeType: string;
  openAIFileId: string | null;
  originalFilename: string;
  updatedAt: string;
  vectorStoreId: string | null;
};

export type KnowledgeDocumentCatalogStore = {
  findFirstDocumentBySha256(
    sha256: string,
  ): Promise<ExistingKnowledgeDocument | null>;
  findDocumentByIdentity(input: {
    datasetVersion: string;
    docId: string;
    documentVersion: number;
  }): Promise<KnowledgeDocumentCatalogDocument | null>;
};

function mapExistingKnowledgeDocument(
  row: ExistingKnowledgeDocumentCatalogRow,
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

function mapKnowledgeDocumentCatalogDocument(
  row: KnowledgeDocumentCatalogDocumentRow,
): KnowledgeDocumentCatalogDocument {
  return {
    ...mapExistingKnowledgeDocument(row),
    customMetadata: row.custom_metadata_json,
    lastError: row.last_error,
    lastIndexedAt: row.last_indexed_at,
    mimeType: row.mime_type,
    openAIFileId: row.openai_file_id,
    originalFilename: row.original_filename,
    updatedAt: row.updated_at,
    vectorStoreId: row.vector_store_id,
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
        .returns<ExistingKnowledgeDocumentCatalogRow[]>();

      if (error) {
        throw new Error(
          `Failed to load knowledge document duplicates: ${error.message}`,
        );
      }

      const row = existingKnowledgeDocumentCatalogRowSchema
        .array()
        .parse(data ?? [])[0];

      return row ? mapExistingKnowledgeDocument(row) : null;
    },

    async findDocumentByIdentity(input) {
      const { data, error } = await client
        .from("knowledge_documents")
        .select(
          "id, doc_id, title, original_filename, document_version, status, canonical_path, mime_type, sha256, dataset_version, openai_file_id, vector_store_id, custom_metadata_json, last_indexed_at, last_error, created_at, updated_at",
        )
        .eq("dataset_version", input.datasetVersion)
        .eq("doc_id", input.docId)
        .eq("document_version", input.documentVersion)
        .limit(1)
        .returns<KnowledgeDocumentCatalogDocumentRow[]>();

      if (error) {
        throw new Error(
          `Failed to load knowledge document by identity: ${error.message}`,
        );
      }

      const row = knowledgeDocumentCatalogDocumentRowSchema
        .array()
        .parse(data ?? [])[0];

      return row ? mapKnowledgeDocumentCatalogDocument(row) : null;
    },
  };
}

export const knowledgeDocumentCatalogStore =
  createKnowledgeDocumentCatalogStore();
