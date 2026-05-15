import { createHash } from "node:crypto";
import { z } from "zod";
import {
  KnowledgeDocumentValidationError,
  MAX_KNOWLEDGE_DOCUMENT_SIZE_BYTES,
  validateKnowledgeDocumentCandidate,
} from "./document-validation";
import {
  KNOWLEDGE_DOCUMENTS_STORAGE_BUCKET,
  knowledgeDocumentMetadataSchema,
} from "./document-metadata";
import {
  AttachKnowledgeDocumentToVectorStoreError,
  type AttachKnowledgeDocumentToVectorStoreResult,
} from "./attach-document-to-vector-store-core";
import {
  UploadKnowledgeDocumentToOpenAIError,
  type UploadKnowledgeDocumentToOpenAIResult,
} from "./openai-file-upload-core";
import type {
  KnowledgeDocumentCatalogDocument,
  KnowledgeDocumentCatalogStore,
} from "@/lib/supabase/knowledge-document-store-core";

const safePathSegmentPattern = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

const adminKnowledgeDocumentUploadInputSchema = knowledgeDocumentMetadataSchema
  .pick({
    datasetVersion: true,
    docId: true,
    title: true,
  })
  .extend({
    documentVersion: z.number().int().positive(),
    file: z.custom<Blob & { name?: string; type?: string }>(
      (value) =>
        typeof value === "object" &&
        value !== null &&
        "arrayBuffer" in value &&
        typeof value.arrayBuffer === "function" &&
        "size" in value &&
        typeof value.size === "number",
    ),
  });

type AdminKnowledgeDocumentUploadInput = z.input<
  typeof adminKnowledgeDocumentUploadInputSchema
>;

type AdminKnowledgeDocumentUploadParsedInput = z.output<
  typeof adminKnowledgeDocumentUploadInputSchema
>;

type StorageUploadResult = {
  error: {
    message: string;
  } | null;
};

type StorageRemoveResult = {
  error: {
    message: string;
  } | null;
};

type AdminKnowledgeDocumentUploadStorageClient = {
  storage: {
    from(bucket: string): {
      remove(paths: string[]): Promise<StorageRemoveResult>;
      upload(
        path: string,
        fileBody: Blob,
        fileOptions: {
          cacheControl: string;
          contentType: string;
          metadata: Record<string, string | number>;
          upsert: boolean;
        },
      ): Promise<StorageUploadResult>;
    };
  };
};

export type AdminKnowledgeDocumentUploadResult = {
  document: {
    canonicalPath: string;
    datasetVersion: string;
    docId: string;
    documentVersion: number;
    lastIndexedAt: string | null;
    openAIFileId: string | null;
    status: KnowledgeDocumentCatalogDocument["status"];
    vectorStoreId: string | null;
  };
  openAIFile: {
    id: string;
    requestId: string | null;
    status: UploadKnowledgeDocumentToOpenAIResult["openAIFile"]["status"];
  };
  vectorStore: {
    fileId: string;
    id: string;
    requestId: string | null;
    status: AttachKnowledgeDocumentToVectorStoreResult["vectorStore"]["status"];
  };
};

export type AdminKnowledgeDocumentUploadDeps = {
  attachToVectorStore(input: {
    datasetVersion: string;
    docId: string;
    documentVersion: number;
  }): Promise<AttachKnowledgeDocumentToVectorStoreResult>;
  catalogStore: Pick<
    KnowledgeDocumentCatalogStore,
    "createPendingDocument" | "findFirstDocumentBySha256"
  >;
  storage: AdminKnowledgeDocumentUploadStorageClient;
  uploadToOpenAI(input: {
    datasetVersion: string;
    docId: string;
    documentVersion: number;
  }): Promise<UploadKnowledgeDocumentToOpenAIResult>;
};

export type AdminKnowledgeDocumentUploadErrorCode =
  | "catalog_conflict"
  | "catalog_insert_failed"
  | "duplicate_sha256"
  | "invalid_file"
  | "invalid_path_segment"
  | "invalid_request"
  | "openai_upload_failed"
  | "storage_cleanup_failed"
  | "storage_upload_failed"
  | "vector_store_attach_failed";

type AdminKnowledgeDocumentUploadErrorInput = {
  canonicalPath?: string | null;
  cause?: unknown;
  code: AdminKnowledgeDocumentUploadErrorCode;
  message: string;
};

export class AdminKnowledgeDocumentUploadError extends Error {
  readonly canonicalPath: string | null | undefined;
  override readonly cause: unknown;
  readonly code: AdminKnowledgeDocumentUploadErrorCode;

  constructor(input: AdminKnowledgeDocumentUploadErrorInput) {
    super(input.message);
    this.name = "AdminKnowledgeDocumentUploadError";
    this.canonicalPath = input.canonicalPath;
    this.cause = input.cause;
    this.code = input.code;
  }
}

function normalizeFileName(fileName: string | undefined) {
  const trimmedFileName = fileName?.trim();

  if (!trimmedFileName) {
    return "document.pdf";
  }

  return (
    trimmedFileName.replace(/\\/g, "/").split("/").at(-1) ?? "document.pdf"
  );
}

export function buildSafeKnowledgeDocumentFilename(fileName: string) {
  const safeBaseName = normalizeFileName(fileName)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^\.+/g, "")
    .replace(/^-+|-+$/g, "");

  const fallbackName = safeBaseName.length > 0 ? safeBaseName : "document.pdf";

  return fallbackName.endsWith(".pdf") ? fallbackName : `${fallbackName}.pdf`;
}

export function buildKnowledgeDocumentCanonicalPath(input: {
  datasetVersion: string;
  docId: string;
  documentVersion: number;
  safeFilename: string;
  sha256: string;
}) {
  return [
    "datasets",
    input.datasetVersion,
    input.docId,
    `v${input.documentVersion}`,
    `${input.sha256}--${input.safeFilename}`,
  ].join("/");
}

function assertSafePathSegment(name: string, value: string) {
  if (value === "." || value === ".." || !safePathSegmentPattern.test(value)) {
    throw new AdminKnowledgeDocumentUploadError({
      code: "invalid_path_segment",
      message: `Invalid ${name}.`,
    });
  }
}

function getOriginalFilename(
  file: AdminKnowledgeDocumentUploadParsedInput["file"],
) {
  return normalizeFileName("name" in file ? file.name : undefined);
}

async function computeSha256Hex(file: Blob) {
  const buffer = Buffer.from(await file.arrayBuffer());

  return createHash("sha256").update(buffer).digest("hex");
}

function isCatalogConflict(error: unknown) {
  const cause =
    error instanceof Error && "cause" in error ? error.cause : undefined;

  if (
    typeof cause === "object" &&
    cause !== null &&
    "code" in cause &&
    cause.code === "23505"
  ) {
    return true;
  }

  return (
    error instanceof Error &&
    /duplicate key|already exists|unique constraint/i.test(error.message)
  );
}

function toAdminUploadError(error: unknown) {
  if (error instanceof AdminKnowledgeDocumentUploadError) {
    return error;
  }

  if (error instanceof KnowledgeDocumentValidationError) {
    return new AdminKnowledgeDocumentUploadError({
      cause: error,
      code:
        error.code === "duplicate_sha256" ? "duplicate_sha256" : "invalid_file",
      message: error.message,
    });
  }

  if (error instanceof UploadKnowledgeDocumentToOpenAIError) {
    return new AdminKnowledgeDocumentUploadError({
      cause: error,
      code: "openai_upload_failed",
      message: error.message,
    });
  }

  if (error instanceof AttachKnowledgeDocumentToVectorStoreError) {
    return new AdminKnowledgeDocumentUploadError({
      cause: error,
      code: "vector_store_attach_failed",
      message: error.message,
    });
  }

  if (error instanceof z.ZodError) {
    return new AdminKnowledgeDocumentUploadError({
      cause: error,
      code: "invalid_request",
      message: "Invalid admin knowledge document upload payload.",
    });
  }

  return new AdminKnowledgeDocumentUploadError({
    cause: error,
    code: "storage_upload_failed",
    message:
      error instanceof Error && error.message.trim().length > 0
        ? error.message
        : "Admin knowledge document upload failed.",
  });
}

async function uploadToStorage(input: {
  canonicalPath: string;
  deps: AdminKnowledgeDocumentUploadDeps;
  file: Blob;
  metadata: Record<string, string | number>;
  mimeType: string;
}) {
  const { error } = await input.deps.storage.storage
    .from(KNOWLEDGE_DOCUMENTS_STORAGE_BUCKET)
    .upload(input.canonicalPath, input.file, {
      cacheControl: "3600",
      contentType: input.mimeType,
      metadata: input.metadata,
      upsert: false,
    });

  if (error) {
    throw new AdminKnowledgeDocumentUploadError({
      canonicalPath: input.canonicalPath,
      code: "storage_upload_failed",
      message: `Failed to upload ${input.canonicalPath} to storage: ${error.message}`,
    });
  }
}

async function removeStorageObject(
  deps: AdminKnowledgeDocumentUploadDeps,
  canonicalPath: string,
  cause: unknown,
) {
  const { error } = await deps.storage.storage
    .from(KNOWLEDGE_DOCUMENTS_STORAGE_BUCKET)
    .remove([canonicalPath]);

  if (error) {
    throw new AdminKnowledgeDocumentUploadError({
      canonicalPath,
      cause: {
        cleanupError: error,
        originalError: cause,
      },
      code: "storage_cleanup_failed",
      message: `Failed to cleanup ${canonicalPath} after catalog insert failure: ${error.message}`,
    });
  }
}

async function createPendingCatalogDocument(input: {
  canonicalPath: string;
  deps: AdminKnowledgeDocumentUploadDeps;
  documentVersion: number;
  file: AdminKnowledgeDocumentUploadParsedInput["file"];
  parsedInput: AdminKnowledgeDocumentUploadParsedInput;
  sha256: string;
}) {
  try {
    return await input.deps.catalogStore.createPendingDocument({
      canonicalPath: input.canonicalPath,
      datasetVersion: input.parsedInput.datasetVersion,
      docId: input.parsedInput.docId,
      documentVersion: input.documentVersion,
      mimeType: input.file.type ?? "",
      originalFilename: getOriginalFilename(input.file),
      sha256: input.sha256,
      title: input.parsedInput.title,
    });
  } catch (error) {
    await removeStorageObject(input.deps, input.canonicalPath, error);

    throw new AdminKnowledgeDocumentUploadError({
      canonicalPath: input.canonicalPath,
      cause: error,
      code: isCatalogConflict(error)
        ? "catalog_conflict"
        : "catalog_insert_failed",
      message: "Failed to create the pending knowledge document catalog row.",
    });
  }
}

export function createAdminKnowledgeDocumentUpload(
  deps: AdminKnowledgeDocumentUploadDeps,
) {
  return async function uploadAdminKnowledgeDocument(
    input: AdminKnowledgeDocumentUploadInput,
  ): Promise<AdminKnowledgeDocumentUploadResult> {
    try {
      const parsedInput = adminKnowledgeDocumentUploadInputSchema.parse(input);
      const originalFilename = getOriginalFilename(parsedInput.file);
      const sha256 = await computeSha256Hex(parsedInput.file);

      assertSafePathSegment("datasetVersion", parsedInput.datasetVersion);
      assertSafePathSegment("docId", parsedInput.docId);

      const candidate = await validateKnowledgeDocumentCandidate(
        {
          datasetVersion: parsedInput.datasetVersion,
          docId: parsedInput.docId,
          mimeType: parsedInput.file.type ?? "",
          originalFilename,
          sha256,
          sizeBytes: parsedInput.file.size,
          title: parsedInput.title,
        },
        deps.catalogStore,
      );
      const safeFilename = buildSafeKnowledgeDocumentFilename(originalFilename);
      const canonicalPath = buildKnowledgeDocumentCanonicalPath({
        datasetVersion: candidate.datasetVersion,
        docId: candidate.docId,
        documentVersion: parsedInput.documentVersion,
        safeFilename,
        sha256: candidate.sha256,
      });

      await uploadToStorage({
        canonicalPath,
        deps,
        file: parsedInput.file,
        metadata: {
          dataset_version: candidate.datasetVersion,
          doc_id: candidate.docId,
          document_version: parsedInput.documentVersion,
          mime_type: candidate.mimeType,
          original_filename: candidate.originalFilename,
          sha256: candidate.sha256,
          title: candidate.title,
        },
        mimeType: candidate.mimeType,
      });

      await createPendingCatalogDocument({
        canonicalPath,
        deps,
        documentVersion: parsedInput.documentVersion,
        file: parsedInput.file,
        parsedInput,
        sha256: candidate.sha256,
      });

      const documentIdentity = {
        datasetVersion: candidate.datasetVersion,
        docId: candidate.docId,
        documentVersion: parsedInput.documentVersion,
      };
      let openAIUpload: UploadKnowledgeDocumentToOpenAIResult;

      try {
        openAIUpload = await deps.uploadToOpenAI(documentIdentity);
      } catch (error) {
        throw new AdminKnowledgeDocumentUploadError({
          cause: error,
          code: "openai_upload_failed",
          message:
            error instanceof Error && error.message.trim().length > 0
              ? error.message
              : "OpenAI document upload failed.",
        });
      }

      let vectorStoreAttach: AttachKnowledgeDocumentToVectorStoreResult;

      try {
        vectorStoreAttach = await deps.attachToVectorStore(documentIdentity);
      } catch (error) {
        throw new AdminKnowledgeDocumentUploadError({
          cause: error,
          code: "vector_store_attach_failed",
          message:
            error instanceof Error && error.message.trim().length > 0
              ? error.message
              : "Vector store attachment failed.",
        });
      }

      return {
        document: {
          canonicalPath,
          datasetVersion: vectorStoreAttach.document.datasetVersion,
          docId: vectorStoreAttach.document.docId,
          documentVersion: vectorStoreAttach.document.documentVersion,
          lastIndexedAt: vectorStoreAttach.vectorStore.lastIndexedAt,
          openAIFileId: vectorStoreAttach.document.openAIFileId,
          status: "ready",
          vectorStoreId: vectorStoreAttach.vectorStore.id,
        },
        openAIFile: {
          id: openAIUpload.openAIFile.id,
          requestId: openAIUpload.openAIFile.requestId,
          status: openAIUpload.openAIFile.status,
        },
        vectorStore: {
          fileId: vectorStoreAttach.vectorStore.fileId,
          id: vectorStoreAttach.vectorStore.id,
          requestId: vectorStoreAttach.vectorStore.requestId,
          status: vectorStoreAttach.vectorStore.status,
        },
      };
    } catch (error) {
      throw toAdminUploadError(error);
    }
  };
}

export { MAX_KNOWLEDGE_DOCUMENT_SIZE_BYTES };
