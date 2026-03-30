import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import initialCatalogManifestJson from "./initial-catalog.manifest.json";
import {
  knowledgeDocumentMetadataSchema,
  KNOWLEDGE_DOCUMENT_ALLOWED_MIME_TYPES,
  MAX_KNOWLEDGE_DOCUMENT_SIZE_BYTES,
} from "./document-metadata";
import {
  type KnowledgeDocumentCatalogDocument,
  type KnowledgeDocumentCatalogStore,
} from "@/lib/supabase/knowledge-document-store";
import type { OpenAIClient } from "@/lib/openai/client";

export const INITIAL_CATALOG_MANIFEST_VERSION = 1;

export const initialCatalogManifestDocumentSchema =
  knowledgeDocumentMetadataSchema
    .extend({
      bucket: z.string().trim().min(1),
      canonicalPath: z.string().trim().min(1),
      customMetadata: z.record(z.string(), z.unknown()),
      documentVersion: z.number().int().positive(),
      lastErrorExpected: z.string().nullable(),
      openaiFileId: z.string().trim().min(1),
      openaiFilePurpose: z.literal("assistants"),
      openaiFileStatus: z.literal("processed"),
      searchProbe: z.string().trim().min(1),
      sizeBytes: z
        .number()
        .int()
        .positive()
        .max(MAX_KNOWLEDGE_DOCUMENT_SIZE_BYTES),
      status: z.enum([
        "pending",
        "uploaded",
        "attached",
        "ready",
        "failed",
        "retired",
      ]),
      vectorStoreFileStatus: z.enum([
        "in_progress",
        "completed",
        "cancelled",
        "failed",
      ]),
      vectorStoreId: z.string().trim().min(1),
    })
    .superRefine((document, context) => {
      if (
        !KNOWLEDGE_DOCUMENT_ALLOWED_MIME_TYPES.includes(
          document.mimeType as (typeof KNOWLEDGE_DOCUMENT_ALLOWED_MIME_TYPES)[number],
        )
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Unsupported manifest MIME type: ${document.mimeType}.`,
          path: ["mimeType"],
        });
      }
    });

export const initialCatalogManifestSchema = z.object({
  documents: initialCatalogManifestDocumentSchema.array().min(1),
  manifestVersion: z.literal(INITIAL_CATALOG_MANIFEST_VERSION),
});

export type InitialCatalogManifest = z.infer<
  typeof initialCatalogManifestSchema
>;
export type InitialCatalogManifestDocument = z.infer<
  typeof initialCatalogManifestDocumentSchema
>;

type SupabaseStorageError = {
  message: string;
};

type StorageInfoResult = {
  data: {
    contentType?: string | null;
    metadata?: Record<string, unknown>;
    size?: number | null;
  } | null;
  error: SupabaseStorageError | null;
};

type StorageDownloadResult = {
  data: Blob | null;
  error: SupabaseStorageError | null;
};

type InitialManifestStorageBucketClient = {
  download(path: string): Promise<StorageDownloadResult>;
  info(path: string): Promise<StorageInfoResult>;
};

type InitialManifestSupabaseStorageClient = {
  from(bucket: string): InitialManifestStorageBucketClient;
};

type InitialManifestSupabaseClient = {
  storage: InitialManifestSupabaseStorageClient;
};

type InitialManifestOpenAIFile = Awaited<
  ReturnType<OpenAIClient["files"]["retrieve"]>
>;

type InitialManifestOpenAIVectorStoreFile = Awaited<
  ReturnType<OpenAIClient["vectorStores"]["files"]["retrieve"]>
>;

type InitialManifestOpenAIVectorStoreSearchResult = Awaited<
  ReturnType<OpenAIClient["vectorStores"]["search"]>
>;

type InitialManifestOpenAIClient = {
  files: Pick<OpenAIClient["files"], "retrieve">;
  vectorStores: Pick<OpenAIClient["vectorStores"], "search"> & {
    files: Pick<OpenAIClient["vectorStores"]["files"], "retrieve">;
  };
};

type InitialCatalogManifestVerifierDeps = {
  catalogStore?: KnowledgeDocumentCatalogStore;
  openAI?: InitialManifestOpenAIClient;
  supabase?: InitialManifestSupabaseClient;
};

export type InitialCatalogManifestDocumentVerification = {
  catalogDocumentId: string | null;
  failures: string[];
  manifestDocument: InitialCatalogManifestDocument;
  openAIFileStatus: InitialManifestOpenAIFile["status"] | null;
  searchHitCount: number;
  searchSnippet: string | null;
  storageObjectSize: number | null;
  vectorStoreFileStatus: InitialManifestOpenAIVectorStoreFile["status"] | null;
};

export type InitialCatalogManifestVerification = {
  documents: InitialCatalogManifestDocumentVerification[];
  ok: boolean;
};

export function loadInitialCatalogManifest(
  input: unknown = initialCatalogManifestJson,
): InitialCatalogManifest {
  return initialCatalogManifestSchema.parse(input);
}

function getStorageBucketClient(
  client: InitialManifestSupabaseClient,
  bucket: string,
): InitialManifestStorageBucketClient {
  return client.storage.from(
    bucket,
  ) as unknown as InitialManifestStorageBucketClient;
}

async function computeSha256Hex(blob: Blob) {
  const content = Buffer.from(await blob.arrayBuffer());
  return createHash("sha256").update(content).digest("hex");
}

function compareCatalogDocument(
  document: InitialCatalogManifestDocument,
  catalogDocument: KnowledgeDocumentCatalogDocument,
) {
  const failures: string[] = [];

  if (catalogDocument.docId !== document.docId) {
    failures.push(
      `Catalog doc_id mismatch: expected ${document.docId}, received ${catalogDocument.docId}.`,
    );
  }

  if (catalogDocument.datasetVersion !== document.datasetVersion) {
    failures.push(
      `Catalog dataset_version mismatch: expected ${document.datasetVersion}, received ${catalogDocument.datasetVersion}.`,
    );
  }

  if (catalogDocument.documentVersion !== document.documentVersion) {
    failures.push(
      `Catalog document_version mismatch: expected ${document.documentVersion}, received ${catalogDocument.documentVersion}.`,
    );
  }

  if (catalogDocument.title !== document.title) {
    failures.push(
      `Catalog title mismatch: expected ${document.title}, received ${catalogDocument.title}.`,
    );
  }

  if (catalogDocument.originalFilename !== document.originalFilename) {
    failures.push(
      `Catalog original_filename mismatch: expected ${document.originalFilename}, received ${catalogDocument.originalFilename}.`,
    );
  }

  if (catalogDocument.mimeType !== document.mimeType) {
    failures.push(
      `Catalog mime_type mismatch: expected ${document.mimeType}, received ${catalogDocument.mimeType}.`,
    );
  }

  if (catalogDocument.sha256 !== document.sha256) {
    failures.push(
      `Catalog sha256 mismatch: expected ${document.sha256}, received ${catalogDocument.sha256}.`,
    );
  }

  if (catalogDocument.canonicalPath !== document.canonicalPath) {
    failures.push(
      `Catalog canonical_path mismatch: expected ${document.canonicalPath}, received ${catalogDocument.canonicalPath}.`,
    );
  }

  if (catalogDocument.status !== document.status) {
    failures.push(
      `Catalog status mismatch: expected ${document.status}, received ${catalogDocument.status}.`,
    );
  }

  if (
    !isDeepStrictEqual(catalogDocument.customMetadata, document.customMetadata)
  ) {
    failures.push("Catalog custom_metadata_json does not match the manifest.");
  }

  if (catalogDocument.openAIFileId !== document.openaiFileId) {
    failures.push(
      `Catalog openai_file_id mismatch: expected ${document.openaiFileId}, received ${catalogDocument.openAIFileId}.`,
    );
  }

  if (catalogDocument.vectorStoreId !== document.vectorStoreId) {
    failures.push(
      `Catalog vector_store_id mismatch: expected ${document.vectorStoreId}, received ${catalogDocument.vectorStoreId}.`,
    );
  }

  if (catalogDocument.lastError !== document.lastErrorExpected) {
    failures.push(
      `Catalog last_error mismatch: expected ${document.lastErrorExpected}, received ${catalogDocument.lastError}.`,
    );
  }

  return failures;
}

function compareOpenAIFile(
  document: InitialCatalogManifestDocument,
  file: InitialManifestOpenAIFile,
) {
  const failures: string[] = [];

  if (file.filename !== document.originalFilename) {
    failures.push(
      `OpenAI file filename mismatch: expected ${document.originalFilename}, received ${file.filename}.`,
    );
  }

  if (file.purpose !== document.openaiFilePurpose) {
    failures.push(
      `OpenAI file purpose mismatch: expected ${document.openaiFilePurpose}, received ${file.purpose}.`,
    );
  }

  if (file.status !== document.openaiFileStatus) {
    failures.push(
      `OpenAI file status mismatch: expected ${document.openaiFileStatus}, received ${file.status}.`,
    );
  }

  return failures;
}

function compareVectorStoreFile(
  document: InitialCatalogManifestDocument,
  file: InitialManifestOpenAIVectorStoreFile,
) {
  const failures: string[] = [];

  if (file.vector_store_id !== document.vectorStoreId) {
    failures.push(
      `Vector store file vector_store_id mismatch: expected ${document.vectorStoreId}, received ${file.vector_store_id}.`,
    );
  }

  if (file.status !== document.vectorStoreFileStatus) {
    failures.push(
      `Vector store file status mismatch: expected ${document.vectorStoreFileStatus}, received ${file.status}.`,
    );
  }

  if (file.last_error !== document.lastErrorExpected) {
    failures.push(
      `Vector store file last_error mismatch: expected ${document.lastErrorExpected}, received ${JSON.stringify(file.last_error)}.`,
    );
  }

  return failures;
}

function compareSearchResults(
  document: InitialCatalogManifestDocument,
  searchResult: InitialManifestOpenAIVectorStoreSearchResult,
) {
  const hits = searchResult.data.filter((result) => {
    const attributes = result.attributes ?? {};

    return (
      result.file_id === document.openaiFileId &&
      attributes.doc_id === document.docId &&
      attributes.dataset_version === document.datasetVersion &&
      attributes.document_version === document.documentVersion
    );
  });

  const snippet =
    hits[0]?.content.find((content) => content.type === "text")?.text ?? null;

  if (hits.length === 0) {
    return {
      failures: [
        `Vector store search did not return a hit for ${document.openaiFileId}.`,
      ],
      hitCount: 0,
      snippet: null,
    };
  }

  return {
    failures: [] as string[],
    hitCount: hits.length,
    snippet,
  };
}

async function verifyDocument(
  document: InitialCatalogManifestDocument,
  deps: Required<InitialCatalogManifestVerifierDeps>,
): Promise<InitialCatalogManifestDocumentVerification> {
  const failures: string[] = [];

  const catalogDocument = await deps.catalogStore.findDocumentByIdentity({
    datasetVersion: document.datasetVersion,
    docId: document.docId,
    documentVersion: document.documentVersion,
  });

  if (!catalogDocument) {
    return {
      catalogDocumentId: null,
      failures: [
        `Catalog row not found for ${document.datasetVersion}/${document.docId}/v${document.documentVersion}.`,
      ],
      manifestDocument: document,
      openAIFileStatus: null,
      searchHitCount: 0,
      searchSnippet: null,
      storageObjectSize: null,
      vectorStoreFileStatus: null,
    };
  }

  failures.push(...compareCatalogDocument(document, catalogDocument));

  const storageBucket = getStorageBucketClient(deps.supabase, document.bucket);
  const storageInfo = await storageBucket.info(document.canonicalPath);

  if (storageInfo.error) {
    failures.push(
      `Storage info lookup failed for ${document.canonicalPath}: ${storageInfo.error.message}.`,
    );
  } else if (!storageInfo.data) {
    failures.push(
      `Storage info lookup returned no object for ${document.canonicalPath}.`,
    );
  } else {
    if (storageInfo.data.contentType !== document.mimeType) {
      failures.push(
        `Storage content type mismatch: expected ${document.mimeType}, received ${storageInfo.data.contentType}.`,
      );
    }

    if (storageInfo.data.size !== document.sizeBytes) {
      failures.push(
        `Storage object size mismatch: expected ${document.sizeBytes}, received ${storageInfo.data.size}.`,
      );
    }
  }

  const storageDownload = await storageBucket.download(document.canonicalPath);

  if (storageDownload.error) {
    failures.push(
      `Storage download failed for ${document.canonicalPath}: ${storageDownload.error.message}.`,
    );
  } else if (!storageDownload.data) {
    failures.push(
      `Storage download returned no data for ${document.canonicalPath}.`,
    );
  } else {
    const sha256 = await computeSha256Hex(storageDownload.data);

    if (sha256 !== document.sha256) {
      failures.push(
        `Storage sha256 mismatch: expected ${document.sha256}, received ${sha256}.`,
      );
    }
  }

  const openAIFile = await deps.openAI.files.retrieve(document.openaiFileId);
  failures.push(...compareOpenAIFile(document, openAIFile));

  const vectorStoreFile = await deps.openAI.vectorStores.files.retrieve(
    document.openaiFileId,
    {
      vector_store_id: document.vectorStoreId,
    },
  );
  failures.push(...compareVectorStoreFile(document, vectorStoreFile));

  const searchResult = await deps.openAI.vectorStores.search(
    document.vectorStoreId,
    {
      query: document.searchProbe,
    },
  );
  const searchVerification = compareSearchResults(document, searchResult);
  failures.push(...searchVerification.failures);

  return {
    catalogDocumentId: catalogDocument.id,
    failures,
    manifestDocument: document,
    openAIFileStatus: openAIFile.status,
    searchHitCount: searchVerification.hitCount,
    searchSnippet: searchVerification.snippet,
    storageObjectSize: storageInfo.data?.size ?? null,
    vectorStoreFileStatus: vectorStoreFile.status,
  };
}

export async function verifyInitialCatalogManifest(
  deps: InitialCatalogManifestVerifierDeps = {},
  manifest: InitialCatalogManifest = loadInitialCatalogManifest(),
): Promise<InitialCatalogManifestVerification> {
  const [catalogModule, supabaseModule, openAIModule] = await Promise.all([
    deps.catalogStore
      ? Promise.resolve(null)
      : import("@/lib/supabase/knowledge-document-store"),
    deps.supabase ? Promise.resolve(null) : import("@/lib/supabase/client"),
    deps.openAI ? Promise.resolve(null) : import("@/lib/openai/client"),
  ]);
  const requiredDeps = {
    catalogStore:
      deps.catalogStore ?? catalogModule!.knowledgeDocumentCatalogStore,
    openAI: deps.openAI ?? openAIModule!.openAIClient,
    supabase: deps.supabase ?? supabaseModule!.supabaseAdmin,
  } satisfies Required<InitialCatalogManifestVerifierDeps>;

  const documents = await Promise.all(
    manifest.documents.map((document) =>
      verifyDocument(document, requiredDeps),
    ),
  );

  return {
    documents,
    ok: documents.every((document) => document.failures.length === 0),
  };
}

export function formatInitialCatalogManifestVerification(
  verification: InitialCatalogManifestVerification,
) {
  const lines = [
    `Initial catalog manifest verification: ${verification.ok ? "PASS" : "FAIL"}`,
  ];

  for (const document of verification.documents) {
    const header = `${document.manifestDocument.docId}@v${document.manifestDocument.documentVersion}`;

    lines.push(
      `${document.failures.length === 0 ? "[PASS]" : "[FAIL]"} ${header} row=${document.catalogDocumentId ?? "missing"} openai=${document.manifestDocument.openaiFileId} vectorStore=${document.manifestDocument.vectorStoreId}`,
    );

    if (document.storageObjectSize !== null) {
      lines.push(`storage.size=${document.storageObjectSize}`);
    }

    if (document.openAIFileStatus) {
      lines.push(`openai.file.status=${document.openAIFileStatus}`);
    }

    if (document.vectorStoreFileStatus) {
      lines.push(`vectorStore.file.status=${document.vectorStoreFileStatus}`);
    }

    lines.push(`search.hits=${document.searchHitCount}`);

    if (document.searchSnippet) {
      lines.push(`search.snippet=${document.searchSnippet.slice(0, 160)}`);
    }

    for (const failure of document.failures) {
      lines.push(`error=${failure}`);
    }
  }

  return lines.join("\n");
}
