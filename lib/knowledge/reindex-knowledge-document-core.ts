import { setTimeout as sleep } from "node:timers/promises";
import { z } from "zod";
import {
  OpenAIAdapterError,
  type OpenAIAdapter,
} from "@/lib/openai/adapter-core";
import { knowledgeDocumentMetadataSchema } from "./document-metadata";
import {
  AttachKnowledgeDocumentToVectorStoreError,
  AttachKnowledgeDocumentToVectorStoreInput,
  AttachKnowledgeDocumentToVectorStoreResult,
} from "./attach-document-to-vector-store-core";
import type {
  KnowledgeDocumentCatalogDocument,
  KnowledgeDocumentCatalogStore,
} from "@/lib/supabase/knowledge-document-store-core";
import type {
  KnowledgeVectorStoreRegistration,
  KnowledgeVectorStoreRegistrationStore,
} from "@/lib/supabase/knowledge-vector-store-registry-core";

const reindexKnowledgeDocumentInputSchema = knowledgeDocumentMetadataSchema
  .pick({
    datasetVersion: true,
    docId: true,
  })
  .extend({
    documentVersion: z.number().int().positive(),
  });

type ReindexableKnowledgeDocument = KnowledgeDocumentCatalogDocument & {
  openAIFileId: string;
};

type ReindexKnowledgeDocumentClient = Pick<
  OpenAIAdapter,
  "deleteVectorStoreFile" | "retrieveVectorStoreFile"
>;

export type ReindexKnowledgeDocumentInput = z.input<
  typeof reindexKnowledgeDocumentInputSchema
>;

export type ReindexKnowledgeDocumentResult = {
  document: AttachKnowledgeDocumentToVectorStoreResult["document"];
  reindex: {
    previousAttachmentDeleted: boolean;
    previousAttachmentMissing: boolean;
    previousVectorStoreId: string | null;
    resetStatus: "uploaded";
  };
  vectorStore: AttachKnowledgeDocumentToVectorStoreResult["vectorStore"];
};

export type ReindexKnowledgeDocumentDeps = {
  attachKnowledgeDocumentToVectorStore(
    input: AttachKnowledgeDocumentToVectorStoreInput,
  ): Promise<AttachKnowledgeDocumentToVectorStoreResult>;
  catalogStore: Pick<
    KnowledgeDocumentCatalogStore,
    "findDocumentByIdentity" | "recordIndexingState"
  >;
  openAI: ReindexKnowledgeDocumentClient;
  registryStore: Pick<
    KnowledgeVectorStoreRegistrationStore,
    "findByDatasetVersion"
  >;
};

export type ReindexKnowledgeDocumentErrorCode =
  | "catalog_record_failed"
  | "document_not_found"
  | "document_not_uploaded"
  | "document_retired"
  | "openai_vector_store_file_delete_failed"
  | "openai_vector_store_file_lookup_failed"
  | "reindex_attach_failed"
  | "vector_store_not_registered";

type ReindexKnowledgeDocumentErrorInput = {
  cause?: unknown;
  code: ReindexKnowledgeDocumentErrorCode;
  message: string;
  openAIFileId?: string | null;
  vectorStoreId?: string | null;
};

export class ReindexKnowledgeDocumentError extends Error {
  override readonly cause: unknown;
  readonly code: ReindexKnowledgeDocumentErrorCode;
  readonly openAIFileId: string | null | undefined;
  readonly vectorStoreId: string | null | undefined;

  constructor(input: ReindexKnowledgeDocumentErrorInput) {
    super(input.message);
    this.name = "ReindexKnowledgeDocumentError";
    this.code = input.code;
    this.cause = input.cause;
    this.openAIFileId = input.openAIFileId;
    this.vectorStoreId = input.vectorStoreId;
  }
}

type ExistingAttachmentState = {
  previousAttachmentDeleted: boolean;
  previousAttachmentMissing: boolean;
  previousVectorStoreId: string | null;
};

const REINDEX_ATTACH_RETRY_LIMIT = 1;
const REINDEX_ATTACH_RETRY_DELAY_MS = 1_000;

function getCurrentTimestamp() {
  return new Date().toISOString();
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  if (typeof error === "string" && error.trim().length > 0) {
    return error;
  }

  return "Knowledge document reindex failed.";
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

function getDetailedErrorMessage(error: unknown) {
  if (error instanceof OpenAIAdapterError) {
    return formatOpenAIAdapterErrorMessage(error);
  }

  return getErrorMessage(error);
}

function isMissingVectorStoreFileError(error: unknown) {
  return error instanceof OpenAIAdapterError && error.status === 404;
}

function createPreconditionError(
  code:
    | "document_not_found"
    | "document_not_uploaded"
    | "document_retired"
    | "vector_store_not_registered",
  message: string,
  input?: {
    openAIFileId?: string | null;
    vectorStoreId?: string | null;
  },
) {
  return new ReindexKnowledgeDocumentError({
    code,
    message,
    openAIFileId: input?.openAIFileId,
    vectorStoreId: input?.vectorStoreId,
  });
}

function createOperationalError(input: {
  code:
    | "openai_vector_store_file_delete_failed"
    | "openai_vector_store_file_lookup_failed"
    | "reindex_attach_failed";
  error: unknown;
  openAIFileId: string;
  vectorStoreId: string | null;
}) {
  return new ReindexKnowledgeDocumentError({
    cause: input.error,
    code: input.code,
    message: getDetailedErrorMessage(input.error),
    openAIFileId: input.openAIFileId,
    vectorStoreId: input.vectorStoreId,
  });
}

function createCatalogRecordFailureError(input: {
  catalogError: unknown;
  message: string;
  openAIFileId: string;
  recoveryError: unknown | null;
  vectorStoreId: string | null;
}) {
  return new ReindexKnowledgeDocumentError({
    cause: {
      catalogError: input.catalogError,
      recoveryError: input.recoveryError,
    },
    code: "catalog_record_failed",
    message: input.message,
    openAIFileId: input.openAIFileId,
    vectorStoreId: input.vectorStoreId,
  });
}

function isRetryableAttachFailure(error: unknown) {
  if (!(error instanceof AttachKnowledgeDocumentToVectorStoreError)) {
    return false;
  }

  if (
    error.code === "openai_vector_store_attach_failed" ||
    error.code === "openai_vector_store_poll_failed"
  ) {
    return error.cause instanceof OpenAIAdapterError && error.cause.retryable;
  }

  return (
    error.code === "openai_vector_store_file_processing_failed" &&
    error.message.includes("server_error:")
  );
}

async function loadReindexableDocument(
  input: z.output<typeof reindexKnowledgeDocumentInputSchema>,
  catalogStore: ReindexKnowledgeDocumentDeps["catalogStore"],
): Promise<ReindexableKnowledgeDocument> {
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
      `Knowledge document ${input.datasetVersion}/${input.docId}/v${input.documentVersion} is retired and cannot be reindexed.`,
      {
        openAIFileId: document.openAIFileId,
        vectorStoreId: document.vectorStoreId,
      },
    );
  }

  if (!document.openAIFileId) {
    throw createPreconditionError(
      "document_not_uploaded",
      `Knowledge document ${input.datasetVersion}/${input.docId}/v${input.documentVersion} does not have an openai_file_id yet.`,
      {
        vectorStoreId: document.vectorStoreId,
      },
    );
  }

  return document as ReindexableKnowledgeDocument;
}

async function loadVectorStoreRegistration(
  datasetVersion: string,
  registryStore: ReindexKnowledgeDocumentDeps["registryStore"],
): Promise<KnowledgeVectorStoreRegistration> {
  const registration = await registryStore.findByDatasetVersion(datasetVersion);

  if (!registration) {
    throw createPreconditionError(
      "vector_store_not_registered",
      `No vector store is registered for dataset_version=${datasetVersion}.`,
    );
  }

  return registration;
}

async function recordFailedReindexState(input: {
  catalogStore: ReindexKnowledgeDocumentDeps["catalogStore"];
  document: ReindexableKnowledgeDocument;
  lastError: string;
  lastIndexedAt: string;
  vectorStoreId: string | null;
  reindexError: ReindexKnowledgeDocumentError;
}) {
  try {
    await input.catalogStore.recordIndexingState({
      datasetVersion: input.document.datasetVersion,
      docId: input.document.docId,
      documentVersion: input.document.documentVersion,
      lastError: input.lastError,
      lastIndexedAt: input.lastIndexedAt,
      openAIFileId: input.document.openAIFileId,
      status: "failed",
      vectorStoreId: input.vectorStoreId,
    });
  } catch (catalogError) {
    throw createCatalogRecordFailureError({
      catalogError,
      message: `${input.reindexError.message} | Failed to record the reindex result in knowledge_documents: ${getDetailedErrorMessage(catalogError)}`,
      openAIFileId: input.document.openAIFileId,
      recoveryError: null,
      vectorStoreId: input.vectorStoreId,
    });
  }
}

async function resetDocumentToUploaded(input: {
  catalogStore: ReindexKnowledgeDocumentDeps["catalogStore"];
  document: ReindexableKnowledgeDocument;
}) {
  try {
    await input.catalogStore.recordIndexingState({
      datasetVersion: input.document.datasetVersion,
      docId: input.document.docId,
      documentVersion: input.document.documentVersion,
      lastError: null,
      lastIndexedAt: null,
      openAIFileId: input.document.openAIFileId,
      status: "uploaded",
      vectorStoreId: null,
    });
  } catch (catalogError) {
    const resetError = new ReindexKnowledgeDocumentError({
      cause: catalogError,
      code: "catalog_record_failed",
      message: `Knowledge document ${input.document.datasetVersion}/${input.document.docId}/v${input.document.documentVersion} could not be reset to uploaded before reindexing: ${getDetailedErrorMessage(catalogError)}`,
      openAIFileId: input.document.openAIFileId,
      vectorStoreId: null,
    });

    let recoveryError: unknown | null = null;

    try {
      await input.catalogStore.recordIndexingState({
        datasetVersion: input.document.datasetVersion,
        docId: input.document.docId,
        documentVersion: input.document.documentVersion,
        lastError: resetError.message,
        lastIndexedAt: getCurrentTimestamp(),
        openAIFileId: input.document.openAIFileId,
        status: "failed",
        vectorStoreId: null,
      });
    } catch (error) {
      recoveryError = error;
    }

    throw createCatalogRecordFailureError({
      catalogError,
      message: recoveryError
        ? `${resetError.message}. Recording the failed recovery state also failed: ${getDetailedErrorMessage(recoveryError)}. Manual catalog reconciliation is required.`
        : `${resetError.message}. Catalog row marked as failed for operator review.`,
      openAIFileId: input.document.openAIFileId,
      recoveryError,
      vectorStoreId: null,
    });
  }
}

async function deleteExistingAttachmentIfPresent(input: {
  document: ReindexableKnowledgeDocument;
  openAI: ReindexKnowledgeDocumentDeps["openAI"];
  vectorStoreId: string;
}): Promise<ExistingAttachmentState> {
  try {
    await input.openAI.retrieveVectorStoreFile(
      input.vectorStoreId,
      input.document.openAIFileId,
    );
  } catch (error) {
    if (isMissingVectorStoreFileError(error)) {
      return {
        previousAttachmentDeleted: false,
        previousAttachmentMissing: true,
        previousVectorStoreId: input.vectorStoreId,
      };
    }

    throw createOperationalError({
      code: "openai_vector_store_file_lookup_failed",
      error,
      openAIFileId: input.document.openAIFileId,
      vectorStoreId: input.vectorStoreId,
    });
  }

  try {
    const deletedVectorStoreFile = await input.openAI.deleteVectorStoreFile(
      input.vectorStoreId,
      input.document.openAIFileId,
    );

    if (!deletedVectorStoreFile.deleted) {
      throw new Error(
        `Vector store file ${input.document.openAIFileId} deletion did not confirm deleted=true.`,
      );
    }
  } catch (error) {
    throw createOperationalError({
      code: "openai_vector_store_file_delete_failed",
      error,
      openAIFileId: input.document.openAIFileId,
      vectorStoreId: input.vectorStoreId,
    });
  }

  return {
    previousAttachmentDeleted: true,
    previousAttachmentMissing: false,
    previousVectorStoreId: input.vectorStoreId,
  };
}

async function attachWithRetry(input: {
  attachKnowledgeDocumentToVectorStore: ReindexKnowledgeDocumentDeps["attachKnowledgeDocumentToVectorStore"];
  catalogStore: ReindexKnowledgeDocumentDeps["catalogStore"];
  document: ReindexableKnowledgeDocument;
  parsedInput: z.output<typeof reindexKnowledgeDocumentInputSchema>;
}) {
  let attempt = 0;

  while (true) {
    try {
      return await input.attachKnowledgeDocumentToVectorStore(
        input.parsedInput,
      );
    } catch (error) {
      if (
        !isRetryableAttachFailure(error) ||
        attempt >= REINDEX_ATTACH_RETRY_LIMIT
      ) {
        throw error;
      }

      attempt += 1;
      await sleep(REINDEX_ATTACH_RETRY_DELAY_MS);
      await resetDocumentToUploaded({
        catalogStore: input.catalogStore,
        document: input.document,
      });
    }
  }
}

export function createReindexKnowledgeDocument(
  deps: ReindexKnowledgeDocumentDeps,
) {
  return async function reindexKnowledgeDocument(
    input: ReindexKnowledgeDocumentInput,
  ): Promise<ReindexKnowledgeDocumentResult> {
    const parsedInput = reindexKnowledgeDocumentInputSchema.parse(input);
    const document = await loadReindexableDocument(
      parsedInput,
      deps.catalogStore,
    );
    const vectorStoreRegistration = await loadVectorStoreRegistration(
      document.datasetVersion,
      deps.registryStore,
    );
    const currentVectorStoreId =
      document.vectorStoreId ?? vectorStoreRegistration.vectorStoreId;

    let existingAttachmentState: ExistingAttachmentState;

    try {
      existingAttachmentState = await deleteExistingAttachmentIfPresent({
        document,
        openAI: deps.openAI,
        vectorStoreId: currentVectorStoreId,
      });
    } catch (error) {
      const reindexError =
        error instanceof ReindexKnowledgeDocumentError
          ? error
          : createOperationalError({
              code: "openai_vector_store_file_lookup_failed",
              error,
              openAIFileId: document.openAIFileId,
              vectorStoreId: currentVectorStoreId,
            });

      await recordFailedReindexState({
        catalogStore: deps.catalogStore,
        document,
        lastError: reindexError.message,
        lastIndexedAt: getCurrentTimestamp(),
        reindexError,
        vectorStoreId: currentVectorStoreId,
      });

      throw reindexError;
    }

    await resetDocumentToUploaded({
      catalogStore: deps.catalogStore,
      document,
    });

    let attachResult: AttachKnowledgeDocumentToVectorStoreResult;

    try {
      attachResult = await attachWithRetry({
        attachKnowledgeDocumentToVectorStore:
          deps.attachKnowledgeDocumentToVectorStore,
        catalogStore: deps.catalogStore,
        document,
        parsedInput,
      });
    } catch (error) {
      throw createOperationalError({
        code: "reindex_attach_failed",
        error,
        openAIFileId: document.openAIFileId,
        vectorStoreId: vectorStoreRegistration.vectorStoreId,
      });
    }

    return {
      document: attachResult.document,
      reindex: {
        previousAttachmentDeleted:
          existingAttachmentState.previousAttachmentDeleted,
        previousAttachmentMissing:
          existingAttachmentState.previousAttachmentMissing,
        previousVectorStoreId: existingAttachmentState.previousVectorStoreId,
        resetStatus: "uploaded",
      },
      vectorStore: attachResult.vectorStore,
    };
  };
}
