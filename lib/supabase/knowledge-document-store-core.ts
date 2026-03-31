import { z } from "zod";
import type { SupabaseAdminClient } from "./client-core";

const knowledgeDocumentCatalogStatusSchema = z.enum([
  "pending",
  "uploaded",
  "attached",
  "ready",
  "failed",
  "retired",
]);

const existingKnowledgeDocumentCatalogRowSchema = z.object({
  canonical_path: z.string().min(1),
  created_at: z.string().datetime({ offset: true }),
  dataset_version: z.string().min(1),
  doc_id: z.string().min(1),
  document_version: z.number().int().positive(),
  id: z.string().min(1),
  sha256: z.string().min(1),
  status: knowledgeDocumentCatalogStatusSchema,
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

export type KnowledgeDocumentCatalogStatus = z.infer<
  typeof knowledgeDocumentCatalogStatusSchema
>;

export type KnowledgeDocumentCatalogIndexingStatus = Extract<
  KnowledgeDocumentCatalogStatus,
  "pending" | "uploaded" | "attached" | "ready" | "failed"
>;

export type KnowledgeDocumentCatalogStoreClient = Pick<
  SupabaseAdminClient,
  "from"
>;

export type ExistingKnowledgeDocument = {
  canonicalPath: string;
  createdAt: string;
  datasetVersion: string;
  docId: string;
  documentVersion: number;
  id: string;
  sha256: string;
  status: KnowledgeDocumentCatalogStatus;
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
  findDocumentsByDatasetVersion(input: {
    datasetVersion: string;
    limit: number;
  }): Promise<KnowledgeDocumentCatalogDocument[]>;
  recordIndexingState(input: {
    datasetVersion: string;
    docId: string;
    documentVersion: number;
    lastError: string | null;
    lastIndexedAt: string | null;
    openAIFileId: string | null;
    status: KnowledgeDocumentCatalogIndexingStatus;
    vectorStoreId: string | null;
  }): Promise<KnowledgeDocumentCatalogDocument>;
};

const existingKnowledgeDocumentSelect =
  "id, doc_id, title, document_version, dataset_version, canonical_path, sha256, status, created_at";
const knowledgeDocumentCatalogDocumentSelect =
  "id, doc_id, title, original_filename, document_version, status, canonical_path, mime_type, sha256, dataset_version, openai_file_id, vector_store_id, custom_metadata_json, last_indexed_at, last_error, created_at, updated_at";

function getCurrentTimestamp() {
  return new Date().toISOString();
}

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
  client: KnowledgeDocumentCatalogStoreClient,
): KnowledgeDocumentCatalogStore {
  return {
    async findFirstDocumentBySha256(sha256) {
      const { data, error } = await client
        .from("knowledge_documents")
        .select(existingKnowledgeDocumentSelect)
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
        .select(knowledgeDocumentCatalogDocumentSelect)
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

    async findDocumentsByDatasetVersion(input) {
      const { data, error } = await client
        .from("knowledge_documents")
        .select(knowledgeDocumentCatalogDocumentSelect)
        .eq("dataset_version", input.datasetVersion)
        .order("created_at", {
          ascending: true,
        })
        .order("doc_id", {
          ascending: true,
        })
        .order("document_version", {
          ascending: true,
        })
        .limit(input.limit)
        .returns<KnowledgeDocumentCatalogDocumentRow[]>();

      if (error) {
        throw new Error(
          `Failed to load knowledge documents by dataset version: ${error.message}`,
        );
      }

      return knowledgeDocumentCatalogDocumentRowSchema
        .array()
        .parse(data ?? [])
        .map(mapKnowledgeDocumentCatalogDocument);
    },

    async recordIndexingState(input) {
      const { data, error } = await client
        .from("knowledge_documents")
        .update({
          last_error: input.lastError,
          last_indexed_at: input.lastIndexedAt,
          openai_file_id: input.openAIFileId,
          status: input.status,
          updated_at: getCurrentTimestamp(),
          vector_store_id: input.vectorStoreId,
        })
        .eq("dataset_version", input.datasetVersion)
        .eq("doc_id", input.docId)
        .eq("document_version", input.documentVersion)
        .select(knowledgeDocumentCatalogDocumentSelect)
        .single<KnowledgeDocumentCatalogDocumentRow>();

      if (error || !data) {
        throw new Error(
          `Failed to record knowledge document indexing state: ${error?.message}`,
        );
      }

      return mapKnowledgeDocumentCatalogDocument(
        knowledgeDocumentCatalogDocumentRowSchema.parse(data),
      );
    },
  };
}
