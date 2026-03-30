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
  KnowledgeDocumentCatalogStatus,
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
  "createFile" | "waitForFileProcessing"
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
    status: Extract<KnowledgeDocumentCatalogStatus, "uploaded">;
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
    "findDocumentByIdentity" | "recordOpenAIUploadResult"
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
    message: `${uploadError.message} | Failed to record the upload result in knowledge_documents: ${getErrorMessage(error)}`,
    openAIFileId,
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
    await catalogStore.recordOpenAIUploadResult({
      datasetVersion: document.datasetVersion,
      docId: document.docId,
      documentVersion: document.documentVersion,
      lastError: uploadError.message,
      openAIFileId,
      status: "failed",
    });
  } catch (error) {
    throw createCatalogRecordFailureError(error, openAIFileId, uploadError);
  }
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

    const updatedDocument = await deps.catalogStore.recordOpenAIUploadResult({
      datasetVersion: document.datasetVersion,
      docId: document.docId,
      documentVersion: document.documentVersion,
      lastError: null,
      openAIFileId,
      status: "uploaded",
    });

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
