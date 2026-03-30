import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";
import * as importedInitialManifestModule from "../../lib/knowledge/initial-manifest";

type InitialManifestModule =
  typeof import("../../lib/knowledge/initial-manifest");

const initialManifestModule =
  "default" in importedInitialManifestModule
    ? importedInitialManifestModule.default
    : importedInitialManifestModule;

const typedInitialManifestModule =
  initialManifestModule as InitialManifestModule;

const {
  formatInitialCatalogManifestVerification,
  loadInitialCatalogManifest,
  verifyInitialCatalogManifest,
} = typedInitialManifestModule;

process.loadEnvFile?.();

function requireEnv(name: string) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function createCliSupabaseClient() {
  return createClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    {
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: false,
      },
    },
  );
}

function createCliCatalogStore(
  supabase: ReturnType<typeof createCliSupabaseClient>,
) {
  return {
    async findFirstDocumentBySha256() {
      return null;
    },

    async findDocumentByIdentity(input: {
      datasetVersion: string;
      docId: string;
      documentVersion: number;
    }) {
      const { data, error } = await supabase
        .from("knowledge_documents")
        .select(
          "id, doc_id, title, original_filename, document_version, status, canonical_path, mime_type, sha256, dataset_version, openai_file_id, vector_store_id, custom_metadata_json, last_indexed_at, last_error, created_at, updated_at",
        )
        .eq("dataset_version", input.datasetVersion)
        .eq("doc_id", input.docId)
        .eq("document_version", input.documentVersion)
        .limit(1);

      if (error) {
        throw new Error(
          `Failed to load knowledge document by identity: ${error.message}`,
        );
      }

      const row = data?.[0];

      if (!row) {
        return null;
      }

      return {
        id: row.id,
        docId: row.doc_id,
        title: row.title,
        originalFilename: row.original_filename,
        documentVersion: row.document_version,
        status: row.status,
        canonicalPath: row.canonical_path,
        mimeType: row.mime_type,
        sha256: row.sha256,
        datasetVersion: row.dataset_version,
        openAIFileId: row.openai_file_id,
        vectorStoreId: row.vector_store_id,
        customMetadata: row.custom_metadata_json,
        lastIndexedAt: row.last_indexed_at,
        lastError: row.last_error,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
    },
  };
}

function createCliOpenAIClient() {
  return new OpenAI({
    apiKey: requireEnv("OPENAI_API_KEY"),
    maxRetries: 1,
    timeout: Number(process.env.OPENAI_TIMEOUT_MS ?? "30000"),
  });
}

async function main() {
  const supabase = createCliSupabaseClient();
  const verification = await verifyInitialCatalogManifest(
    {
      catalogStore: createCliCatalogStore(supabase),
      openAI: createCliOpenAIClient(),
      supabase,
    },
    loadInitialCatalogManifest(),
  );
  console.log(formatInitialCatalogManifestVerification(verification));

  if (!verification.ok) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  const message =
    error instanceof Error && error.message.trim().length > 0
      ? (error.stack ?? error.message)
      : String(error);

  console.error(message);
  process.exitCode = 1;
});
