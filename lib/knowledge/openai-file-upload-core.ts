import { z } from "zod";
import {
  OpenAIAdapterError,
  type OpenAIAdapter,
  type OpenAIFileWaitForProcessingResult,
} from "@/lib/openai/adapter-core";
import {
  KNOWLEDGE_DOCUMENTS_STORAGE_BUCKET,
  knowledgeDocumentMetadataSchema,
} from "./document-metadata";
import type {
  KnowledgeDocumentCatalogDocument,
  KnowledgeDocumentCatalogStore,
} from "@/lib/supabase/knowledge-document-store-core";

const uploadKnowledgeDocumentToOpenAIInputSchema =
  knowledgeDocumentMetadataSchema
    .pick({
      datasetVersion: true,
      docId: true,
    })
    .extend({
      documentVersion: z.number().int().positive(),
    });

type UploadKnowledgeDocumentStorageError = {
  message: string;
};

type UploadKnowledgeDocumentStorageDownloadResult = {
  data: Blob | null;
  error: UploadKnowledgeDocumentStorageError | null;
};

type UploadKnowledgeDocumentStorageBucketClient = {
  download(path: string): Promise<UploadKnowledgeDocumentStorageDownloadResult>;
};

type UploadKnowledgeDocumentStorageClient = {
  storage: {
    from(bucket: string): UploadKnowledgeDocumentStorageBucketClient;
  };
};

type UploadKnowledgeDocumentToOpenAIClient = Pick<
  OpenAIAdapter,
  "createFile" | "deleteFile" | "waitForFileProcessing"
>;

export type UploadKnowledgeDocumentToOpenAIInput = z.input<
  typeof uploadKnowledgeDocumentToOpenAIInputSchema
>;

export type UploadKnowledgeDocumentToOpenAIResult = {
  document: {
    canonicalPath: string;
    datasetVersion: string;
    docId: string;
    documentVersion: number;
    mimeType: string;
    originalFilename: string;
    status: "uploaded";
  };
  openAIFile: {
    bytes: number;
    filename: string;
    id: string;
    purpose: string;
    requestId: string | null;
    status: OpenAIFileWaitForProcessingResult["status"];
  };
  storage: {
    bucket: typeof KNOWLEDGE_DOCUMENTS_STORAGE_BUCKET;
    sizeBytes: number;
  };
};

export type UploadKnowledgeDocumentToOpenAIDeps = {
  catalogStore: Pick<
    KnowledgeDocumentCatalogStore,
    "findDocumentByIdentity" | "recordIndexingState"
  >;
  openAI: UploadKnowledgeDocumentToOpenAIClient;
  supabase: UploadKnowledgeDocumentStorageClient;
};

export type UploadKnowledgeDocumentToOpenAIErrorCode =
  | "catalog_record_failed"
  | "document_already_uploaded"
  | "document_not_found"
  | "document_retired"
  | "openai_file_processing_failed"
  | "openai_upload_failed"
  | "storage_download_failed";

type UploadKnowledgeDocumentToOpenAIErrorInput = {
  cause?: unknown;
  code: UploadKnowledgeDocumentToOpenAIErrorCode;
  message: string;
  openAIFileId?: string | null;
};

export class UploadKnowledgeDocumentToOpenAIError extends Error {
  override readonly cause: unknown;
  readonly code: UploadKnowledgeDocumentToOpenAIErrorCode;
  readonly openAIFileId: string | null | undefined;

  constructor(input: UploadKnowledgeDocumentToOpenAIErrorInput) {
    super(input.message);
    this.name = "UploadKnowledgeDocumentToOpenAIError";
    this.code = input.code;
    this.openAIFileId = input.openAIFileId;
    this.cause = input.cause;
  }
}

type DownloadedKnowledgeDocument = {
  blob: Blob;
  sizeBytes: number;
};

type SuccessfulUploadCatalogRecoveryResult = {
  message: string;
  recoveredCatalogOpenAIFileId: string | null;
  recoveryError: unknown | null;
  remoteFileDeleteError: unknown | null;
  remoteFileDeleted: boolean;
};

function createPreconditionError(
  code: "document_already_uploaded" | "document_not_found" | "document_retired",
  message: string,
  openAIFileId?: string | null,
) {
  return new UploadKnowledgeDocumentToOpenAIError({
    code,
    message,
    openAIFileId,
  });
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  if (typeof error === "string" && error.trim().length > 0) {
    return error;
  }

  return "Knowledge document upload failed.";
}

function getDetailedErrorMessage(error: unknown) {
  if (error instanceof OpenAIAdapterError) {
    return formatOpenAIAdapterErrorMessage(error);
  }

  return getErrorMessage(error);
}

function formatOpenAIAdapterErrorMessage(error: OpenAIAdapterError) {
  const parts = [error.message];

  if (error.requestId) {
    parts.push(`request_id=${error.requestId}`);
  }

  if (error.code) {
    parts.push(`code=${error.code}`);
  }

  return parts.join(" | ");
}

function createOperationalUploadError(
  error: unknown,
  openAIFileId: string | null,
) {
  if (error instanceof UploadKnowledgeDocumentToOpenAIError) {
    return error;
  }

  if (error instanceof OpenAIAdapterError) {
    return new UploadKnowledgeDocumentToOpenAIError({
      cause: error,
      code: "openai_upload_failed",
      message: formatOpenAIAdapterErrorMessage(error),
      openAIFileId,
    });
  }

  return new UploadKnowledgeDocumentToOpenAIError({
    cause: error,
    code: "openai_upload_failed",
    message: getErrorMessage(error),
    openAIFileId,
  });
}

function createCatalogRecordFailureError(
  error: unknown,
  openAIFileId: string | null,
  uploadError: UploadKnowledgeDocumentToOpenAIError,
) {
  return new UploadKnowledgeDocumentToOpenAIError({
    cause: {
      catalogError: error,
      uploadError,
    },
    code: "catalog_record_failed",
    message: `${uploadError.message} | Failed to record the upload result in knowledge_documents: ${getDetailedErrorMessage(error)}`,
    openAIFileId,
  });
}

function buildSuccessfulUploadCatalogFailureMessage(input: {
  catalogError: unknown;
  openAIFileId: string | null;
  recoveryError: unknown | null;
  remoteFileDeleteError: unknown | null;
  remoteFileDeleted: boolean;
}) {
  const baseMessage = input.openAIFileId
    ? `Processed OpenAI file ${input.openAIFileId} could not be recorded as uploaded in knowledge_documents: ${getDetailedErrorMessage(input.catalogError)}.`
    : `Processed OpenAI upload could not be recorded as uploaded in knowledge_documents: ${getDetailedErrorMessage(input.catalogError)}.`;

  if (input.remoteFileDeleted) {
    if (input.recoveryError) {
      return `${baseMessage} Remote OpenAI file deleted, but recording the failed recovery state also failed: ${getDetailedErrorMessage(input.recoveryError)}. Manual catalog reconciliation is required.`;
    }

    return `${baseMessage} Remote OpenAI file deleted and catalog row marked as failed for retry.`;
  }

  const cleanupMessage = input.remoteFileDeleteError
    ? ` Remote cleanup failed: ${getDetailedErrorMessage(input.remoteFileDeleteError)}.`
    : input.openAIFileId
      ? " Remote cleanup was not attempted."
      : "";

  if (input.recoveryError) {
    return `${baseMessage}${cleanupMessage} Recording the failed recovery state also failed: ${getDetailedErrorMessage(input.recoveryError)}. Manual cleanup and catalog reconciliation are required.`;
  }

  if (input.openAIFileId) {
    return `${baseMessage}${cleanupMessage} Catalog row marked as failed with openai_file_id preserved for traceability. Manual cleanup is still required.`;
  }

  return `${baseMessage} Catalog row marked as failed without an openai_file_id. Manual investigation may still be required.`;
}

function createSuccessfulUploadCatalogRecordFailureError(input: {
  catalogError: unknown;
  message: string;
  openAIFileId: string | null;
  recoveredCatalogOpenAIFileId: string | null;
  recoveryError: unknown | null;
  remoteFileDeleteError: unknown | null;
  remoteFileDeleted: boolean;
}) {
  return new UploadKnowledgeDocumentToOpenAIError({
    cause: {
      catalogError: input.catalogError,
      recoveredCatalogOpenAIFileId: input.recoveredCatalogOpenAIFileId,
      recoveryError: input.recoveryError,
      remoteFileDeleteError: input.remoteFileDeleteError,
      remoteFileDeleted: input.remoteFileDeleted,
    },
    code: "catalog_record_failed",
    message: input.message,
    openAIFileId: input.openAIFileId,
  });
}

async function downloadKnowledgeDocumentBlob(
  document: KnowledgeDocumentCatalogDocument,
  supabase: UploadKnowledgeDocumentStorageClient,
): Promise<DownloadedKnowledgeDocument> {
  const bucket = supabase.storage.from(KNOWLEDGE_DOCUMENTS_STORAGE_BUCKET);
  const { data, error } = await bucket.download(document.canonicalPath);

  if (error) {
    throw new UploadKnowledgeDocumentToOpenAIError({
      cause: error,
      code: "storage_download_failed",
      message: `Failed to download ${document.canonicalPath} from ${KNOWLEDGE_DOCUMENTS_STORAGE_BUCKET}: ${error.message}`,
      openAIFileId: null,
    });
  }

  if (!data) {
    throw new UploadKnowledgeDocumentToOpenAIError({
      code: "storage_download_failed",
      message: `Storage download returned no data for ${document.canonicalPath}.`,
      openAIFileId: null,
    });
  }

  return {
    blob: data,
    sizeBytes: data.size,
  };
}

function createUploadableFile(
  document: KnowledgeDocumentCatalogDocument,
  blob: Blob,
) {
  return new File([blob], document.originalFilename, {
    type: document.mimeType,
  });
}

async function loadUploadableDocument(
  input: z.output<typeof uploadKnowledgeDocumentToOpenAIInputSchema>,
  catalogStore: UploadKnowledgeDocumentToOpenAIDeps["catalogStore"],
) {
  const document = await catalogStore.findDocumentByIdentity(input);

  if (!document) {
    throw createPreconditionError(
      "document_not_found",
      `Knowledge document not found for ${input.datasetVersion}/${input.docId}/v${input.documentVersion}.`,
    );
  }

  if (document.status === "retired") {
    throw createPreconditionError(
      "document_retired",
      `Knowledge document ${input.datasetVersion}/${input.docId}/v${input.documentVersion} is retired and cannot be uploaded to OpenAI.`,
    );
  }

  if (document.openAIFileId) {
    throw createPreconditionError(
      "document_already_uploaded",
      `Knowledge document ${input.datasetVersion}/${input.docId}/v${input.documentVersion} already has openai_file_id=${document.openAIFileId}.`,
      document.openAIFileId,
    );
  }

  return document;
}

async function recordFailedUpload(
  catalogStore: UploadKnowledgeDocumentToOpenAIDeps["catalogStore"],
  document: KnowledgeDocumentCatalogDocument,
  uploadError: UploadKnowledgeDocumentToOpenAIError,
  openAIFileId: string | null,
) {
  try {
    await catalogStore.recordIndexingState({
      datasetVersion: document.datasetVersion,
      docId: document.docId,
      documentVersion: document.documentVersion,
      lastError: uploadError.message,
      lastIndexedAt: document.lastIndexedAt,
      openAIFileId,
      status: "failed",
      vectorStoreId: document.vectorStoreId,
    });
  } catch (error) {
    throw createCatalogRecordFailureError(error, openAIFileId, uploadError);
  }
}

async function deleteUploadedOpenAIFile(
  openAI: UploadKnowledgeDocumentToOpenAIDeps["openAI"],
  openAIFileId: string,
) {
  const deletedFile = await openAI.deleteFile(openAIFileId);

  if (!deletedFile.deleted) {
    throw new Error(
      `OpenAI file ${openAIFileId} deletion did not confirm deleted=true.`,
    );
  }
}

async function recoverFromSuccessfulUploadCatalogFailure(input: {
  catalogError: unknown;
  catalogStore: UploadKnowledgeDocumentToOpenAIDeps["catalogStore"];
  document: KnowledgeDocumentCatalogDocument;
  openAI: UploadKnowledgeDocumentToOpenAIDeps["openAI"];
  openAIFileId: string | null;
}): Promise<SuccessfulUploadCatalogRecoveryResult> {
  let remoteFileDeleted = false;
  let remoteFileDeleteError: unknown | null = null;
  let recoveredCatalogOpenAIFileId = input.openAIFileId;

  if (input.openAIFileId) {
    try {
      await deleteUploadedOpenAIFile(input.openAI, input.openAIFileId);
      remoteFileDeleted = true;
      recoveredCatalogOpenAIFileId = null;
    } catch (error) {
      remoteFileDeleteError = error;
    }
  }

  const recoveryLastError = buildSuccessfulUploadCatalogFailureMessage({
    catalogError: input.catalogError,
    openAIFileId: input.openAIFileId,
    recoveryError: null,
    remoteFileDeleteError,
    remoteFileDeleted,
  });

  let recoveryError: unknown | null = null;

  try {
    await input.catalogStore.recordIndexingState({
      datasetVersion: input.document.datasetVersion,
      docId: input.document.docId,
      documentVersion: input.document.documentVersion,
      lastError: recoveryLastError,
      lastIndexedAt: input.document.lastIndexedAt,
      openAIFileId: recoveredCatalogOpenAIFileId,
      status: "failed",
      vectorStoreId: input.document.vectorStoreId,
    });
  } catch (error) {
    recoveryError = error;
  }

  return {
    message: buildSuccessfulUploadCatalogFailureMessage({
      catalogError: input.catalogError,
      openAIFileId: input.openAIFileId,
      recoveryError,
      remoteFileDeleteError,
      remoteFileDeleted,
    }),
    recoveredCatalogOpenAIFileId,
    recoveryError,
    remoteFileDeleteError,
    remoteFileDeleted,
  };
}

export function createUploadKnowledgeDocumentToOpenAI(
  deps: UploadKnowledgeDocumentToOpenAIDeps,
) {
  return async function uploadKnowledgeDocumentToOpenAI(
    input: UploadKnowledgeDocumentToOpenAIInput,
  ): Promise<UploadKnowledgeDocumentToOpenAIResult> {
    const parsedInput = uploadKnowledgeDocumentToOpenAIInputSchema.parse(input);
    const document = await loadUploadableDocument(
      parsedInput,
      deps.catalogStore,
    );

    let openAIFileId: string | null = null;
    let downloadedDocument: DownloadedKnowledgeDocument;
    let processedFile: OpenAIFileWaitForProcessingResult;

    try {
      downloadedDocument = await downloadKnowledgeDocumentBlob(
        document,
        deps.supabase,
      );

      const createdFile = await deps.openAI.createFile({
        file: createUploadableFile(document, downloadedDocument.blob),
        purpose: "assistants",
      });

      openAIFileId = createdFile.id;
      processedFile = await deps.openAI.waitForFileProcessing(createdFile.id);

      if (processedFile.status !== "processed") {
        throw new UploadKnowledgeDocumentToOpenAIError({
          code: "openai_file_processing_failed",
          message: `OpenAI file ${processedFile.id} finished with status ${processedFile.status}.`,
          openAIFileId: processedFile.id,
        });
      }
    } catch (error) {
      const uploadError = createOperationalUploadError(error, openAIFileId);

      await recordFailedUpload(
        deps.catalogStore,
        document,
        uploadError,
        openAIFileId,
      );

      throw uploadError;
    }

    let updatedDocument: KnowledgeDocumentCatalogDocument;

    try {
      updatedDocument = await deps.catalogStore.recordIndexingState({
        datasetVersion: document.datasetVersion,
        docId: document.docId,
        documentVersion: document.documentVersion,
        lastError: null,
        lastIndexedAt: null,
        openAIFileId,
        status: "uploaded",
        vectorStoreId: null,
      });
    } catch (catalogError) {
      const recovery = await recoverFromSuccessfulUploadCatalogFailure({
        catalogError,
        catalogStore: deps.catalogStore,
        document,
        openAI: deps.openAI,
        openAIFileId,
      });

      throw createSuccessfulUploadCatalogRecordFailureError({
        catalogError,
        message: recovery.message,
        openAIFileId,
        recoveredCatalogOpenAIFileId: recovery.recoveredCatalogOpenAIFileId,
        recoveryError: recovery.recoveryError,
        remoteFileDeleteError: recovery.remoteFileDeleteError,
        remoteFileDeleted: recovery.remoteFileDeleted,
      });
    }

    return {
      document: {
        canonicalPath: updatedDocument.canonicalPath,
        datasetVersion: updatedDocument.datasetVersion,
        docId: updatedDocument.docId,
        documentVersion: updatedDocument.documentVersion,
        mimeType: updatedDocument.mimeType,
        originalFilename: updatedDocument.originalFilename,
        status: "uploaded",
      },
      openAIFile: {
        bytes: processedFile.bytes,
        filename: processedFile.filename,
        id: processedFile.id,
        purpose: processedFile.purpose,
        requestId:
          "_request_id" in processedFile &&
          typeof processedFile._request_id === "string"
            ? processedFile._request_id
            : null,
        status: processedFile.status,
      },
      storage: {
        bucket: KNOWLEDGE_DOCUMENTS_STORAGE_BUCKET,
        sizeBytes: downloadedDocument.sizeBytes,
      },
    };
  };
}
