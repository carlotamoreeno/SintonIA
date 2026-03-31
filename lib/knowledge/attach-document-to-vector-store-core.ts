import { z } from "zod";
import {
  OpenAIAdapterError,
  type OpenAIAdapter,
  type OpenAIVectorStoreFileCreateResult,
  type OpenAIVectorStoreFilePollResult,
} from "@/lib/openai/adapter-core";
import { knowledgeDocumentMetadataSchema } from "./document-metadata";
import { buildKnowledgeDocumentVectorStoreFileAttributes } from "./vector-store-file-attributes";
import type {
  KnowledgeDocumentCatalogDocument,
  KnowledgeDocumentCatalogStore,
} from "@/lib/supabase/knowledge-document-store-core";
import type {
  KnowledgeVectorStoreRegistration,
  KnowledgeVectorStoreRegistrationStore,
} from "@/lib/supabase/knowledge-vector-store-registry-core";

const attachKnowledgeDocumentToVectorStoreInputSchema =
  knowledgeDocumentMetadataSchema
    .pick({
      datasetVersion: true,
      docId: true,
    })
    .extend({
      documentVersion: z.number().int().positive(),
    });

type AttachableKnowledgeDocument = KnowledgeDocumentCatalogDocument & {
  openAIFileId: string;
};

type AttachKnowledgeDocumentToVectorStoreClient = Pick<
  OpenAIAdapter,
  "createVectorStoreFile" | "deleteVectorStoreFile" | "pollVectorStoreFile"
>;

export type AttachKnowledgeDocumentToVectorStoreInput = z.input<
  typeof attachKnowledgeDocumentToVectorStoreInputSchema
>;

export type AttachKnowledgeDocumentToVectorStoreResult = {
  document: {
    canonicalPath: string;
    datasetVersion: string;
    docId: string;
    documentVersion: number;
    openAIFileId: string;
    status: "ready";
  };
  vectorStore: {
    attributes: Record<string, string | number | boolean>;
    fileId: string;
    id: string;
    lastIndexedAt: string;
    name: string;
    requestId: string | null;
    status: "completed";
  };
};

export type AttachKnowledgeDocumentToVectorStoreDeps = {
  catalogStore: Pick<
    KnowledgeDocumentCatalogStore,
    "findDocumentByIdentity" | "recordVectorStoreIndexResult"
  >;
  openAI: AttachKnowledgeDocumentToVectorStoreClient;
  registryStore: Pick<
    KnowledgeVectorStoreRegistrationStore,
    "findByDatasetVersion"
  >;
};

export type AttachKnowledgeDocumentToVectorStoreErrorCode =
  | "catalog_record_failed"
  | "document_already_indexed"
  | "document_not_found"
  | "document_not_uploaded"
  | "document_retired"
  | "openai_vector_store_attach_failed"
  | "openai_vector_store_file_processing_failed"
  | "openai_vector_store_poll_failed"
  | "vector_store_not_registered";

type AttachKnowledgeDocumentToVectorStoreErrorInput = {
  cause?: unknown;
  code: AttachKnowledgeDocumentToVectorStoreErrorCode;
  message: string;
  openAIFileId?: string | null;
  vectorStoreFileId?: string | null;
  vectorStoreId?: string | null;
};

export class AttachKnowledgeDocumentToVectorStoreError extends Error {
  override readonly cause: unknown;
  readonly code: AttachKnowledgeDocumentToVectorStoreErrorCode;
  readonly openAIFileId: string | null | undefined;
  readonly vectorStoreFileId: string | null | undefined;
  readonly vectorStoreId: string | null | undefined;

  constructor(input: AttachKnowledgeDocumentToVectorStoreErrorInput) {
    super(input.message);
    this.name = "AttachKnowledgeDocumentToVectorStoreError";
    this.code = input.code;
    this.cause = input.cause;
    this.openAIFileId = input.openAIFileId;
    this.vectorStoreFileId = input.vectorStoreFileId;
    this.vectorStoreId = input.vectorStoreId;
  }
}

type FailedIndexRecoveryResult = {
  message: string;
  recoveredVectorStoreId: string | null;
  recoveryError: unknown | null;
  remoteVectorStoreFileDeleteError: unknown | null;
  remoteVectorStoreFileDeleted: boolean;
};

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

  return "Knowledge document vector store indexing failed.";
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

function getRequestId(value: unknown) {
  if (
    typeof value === "object" &&
    value !== null &&
    "_request_id" in value &&
    (typeof value._request_id === "string" || value._request_id === null)
  ) {
    return value._request_id;
  }

  return null;
}

function getVectorStoreFileId(
  value: unknown,
  fallbackOpenAIFileId: string,
): string {
  if (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    typeof value.id === "string" &&
    value.id.trim().length > 0
  ) {
    return value.id;
  }

  return fallbackOpenAIFileId;
}

function createPreconditionError(
  code:
    | "document_already_indexed"
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
  return new AttachKnowledgeDocumentToVectorStoreError({
    code,
    message,
    openAIFileId: input?.openAIFileId,
    vectorStoreId: input?.vectorStoreId,
  });
}

function createOperationalError(input: {
  code: "openai_vector_store_attach_failed" | "openai_vector_store_poll_failed";
  error: unknown;
  openAIFileId: string;
  vectorStoreFileId: string;
  vectorStoreId: string;
}) {
  return new AttachKnowledgeDocumentToVectorStoreError({
    cause: input.error,
    code: input.code,
    message: getDetailedErrorMessage(input.error),
    openAIFileId: input.openAIFileId,
    vectorStoreFileId: input.vectorStoreFileId,
    vectorStoreId: input.vectorStoreId,
  });
}

function formatTerminalProcessingError(
  vectorStoreFile: OpenAIVectorStoreFilePollResult,
) {
  const lastError =
    vectorStoreFile.last_error?.message &&
    vectorStoreFile.last_error.message.trim().length > 0
      ? ` ${vectorStoreFile.last_error.code}: ${vectorStoreFile.last_error.message}`
      : "";

  return `Vector store file ${vectorStoreFile.id} finished with status ${vectorStoreFile.status}.${lastError}`.trim();
}

function createTerminalProcessingError(input: {
  openAIFileId: string;
  vectorStoreFile: OpenAIVectorStoreFilePollResult;
  vectorStoreId: string;
}) {
  return new AttachKnowledgeDocumentToVectorStoreError({
    code: "openai_vector_store_file_processing_failed",
    message: formatTerminalProcessingError(input.vectorStoreFile),
    openAIFileId: input.openAIFileId,
    vectorStoreFileId: input.vectorStoreFile.id,
    vectorStoreId: input.vectorStoreId,
  });
}

function createCatalogRecordFailureError(input: {
  catalogError: unknown;
  attachError: AttachKnowledgeDocumentToVectorStoreError;
}) {
  return new AttachKnowledgeDocumentToVectorStoreError({
    cause: {
      attachError: input.attachError,
      catalogError: input.catalogError,
    },
    code: "catalog_record_failed",
    message: `${input.attachError.message} | Failed to record the vector store index result in knowledge_documents: ${getDetailedErrorMessage(input.catalogError)}`,
    openAIFileId: input.attachError.openAIFileId,
    vectorStoreFileId: input.attachError.vectorStoreFileId,
    vectorStoreId: input.attachError.vectorStoreId,
  });
}

function buildCatalogPersistenceFailureMessage(input: {
  catalogError: unknown;
  phase: "attached" | "failed" | "ready";
  recoveryError: unknown | null;
  remoteVectorStoreFileDeleteError: unknown | null;
  remoteVectorStoreFileDeleted: boolean;
  vectorStoreFileId: string;
  vectorStoreId: string;
}) {
  const baseMessage = `Vector store file ${input.vectorStoreFileId} for vector store ${input.vectorStoreId} could not be recorded as ${input.phase} in knowledge_documents: ${getDetailedErrorMessage(input.catalogError)}.`;

  if (input.remoteVectorStoreFileDeleted) {
    if (input.recoveryError) {
      return `${baseMessage} Remote vector store file deleted, but recording the failed recovery state also failed: ${getDetailedErrorMessage(input.recoveryError)}. Manual catalog reconciliation is required.`;
    }

    return `${baseMessage} Remote vector store file deleted and catalog row marked as failed for retry.`;
  }

  const cleanupMessage = input.remoteVectorStoreFileDeleteError
    ? ` Remote cleanup failed: ${getDetailedErrorMessage(input.remoteVectorStoreFileDeleteError)}.`
    : " Remote cleanup was not attempted.";

  if (input.recoveryError) {
    return `${baseMessage}${cleanupMessage} Recording the failed recovery state also failed: ${getDetailedErrorMessage(input.recoveryError)}. Manual cleanup and catalog reconciliation are required.`;
  }

  return `${baseMessage}${cleanupMessage} Catalog row marked as failed with vector_store_id preserved for traceability. Manual cleanup is still required.`;
}

async function loadAttachableDocument(
  input: z.output<typeof attachKnowledgeDocumentToVectorStoreInputSchema>,
  catalogStore: AttachKnowledgeDocumentToVectorStoreDeps["catalogStore"],
): Promise<AttachableKnowledgeDocument> {
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
      `Knowledge document ${input.datasetVersion}/${input.docId}/v${input.documentVersion} is retired and cannot be attached to a vector store.`,
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

  if (
    document.status === "ready" ||
    (document.status === "attached" && document.vectorStoreId)
  ) {
    throw createPreconditionError(
      "document_already_indexed",
      `Knowledge document ${input.datasetVersion}/${input.docId}/v${input.documentVersion} is already indexed in vector_store_id=${document.vectorStoreId ?? "<unknown>"}.`,
      {
        openAIFileId: document.openAIFileId,
        vectorStoreId: document.vectorStoreId,
      },
    );
  }

  return document as AttachableKnowledgeDocument;
}

async function loadVectorStoreRegistration(
  datasetVersion: string,
  registryStore: AttachKnowledgeDocumentToVectorStoreDeps["registryStore"],
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

async function deleteVectorStoreFile(
  openAI: AttachKnowledgeDocumentToVectorStoreDeps["openAI"],
  vectorStoreId: string,
  vectorStoreFileId: string,
) {
  const deletedVectorStoreFile = await openAI.deleteVectorStoreFile(
    vectorStoreId,
    vectorStoreFileId,
  );

  if (!deletedVectorStoreFile.deleted) {
    throw new Error(
      `Vector store file ${vectorStoreFileId} deletion did not confirm deleted=true.`,
    );
  }
}

async function recordFailedIndexResult(
  catalogStore: AttachKnowledgeDocumentToVectorStoreDeps["catalogStore"],
  document: AttachableKnowledgeDocument,
  input: {
    lastError: string;
    lastIndexedAt: string;
    vectorStoreId: string | null;
  },
  attachError: AttachKnowledgeDocumentToVectorStoreError,
) {
  try {
    await catalogStore.recordVectorStoreIndexResult({
      datasetVersion: document.datasetVersion,
      docId: document.docId,
      documentVersion: document.documentVersion,
      lastError: input.lastError,
      lastIndexedAt: input.lastIndexedAt,
      status: "failed",
      vectorStoreId: input.vectorStoreId,
    });
  } catch (catalogError) {
    throw createCatalogRecordFailureError({
      attachError,
      catalogError,
    });
  }
}

async function recordFailedIndexResultWithRecovery(input: {
  catalogStore: AttachKnowledgeDocumentToVectorStoreDeps["catalogStore"];
  document: AttachableKnowledgeDocument;
  lastError: string;
  lastIndexedAt: string;
  openAI: AttachKnowledgeDocumentToVectorStoreDeps["openAI"];
  vectorStoreFileId: string;
  vectorStoreId: string;
}) {
  try {
    await input.catalogStore.recordVectorStoreIndexResult({
      datasetVersion: input.document.datasetVersion,
      docId: input.document.docId,
      documentVersion: input.document.documentVersion,
      lastError: input.lastError,
      lastIndexedAt: input.lastIndexedAt,
      status: "failed",
      vectorStoreId: input.vectorStoreId,
    });
  } catch (catalogError) {
    const recovery = await recoverFromCatalogPersistenceFailure({
      catalogError,
      catalogStore: input.catalogStore,
      document: input.document,
      openAI: input.openAI,
      phase: "failed",
      vectorStoreFileId: input.vectorStoreFileId,
      vectorStoreId: input.vectorStoreId,
    });

    throw createCatalogPersistenceFailureError({
      catalogError,
      message: recovery.message,
      openAIFileId: input.document.openAIFileId,
      recoveredVectorStoreId: recovery.recoveredVectorStoreId,
      recoveryError: recovery.recoveryError,
      remoteVectorStoreFileDeleteError:
        recovery.remoteVectorStoreFileDeleteError,
      remoteVectorStoreFileDeleted: recovery.remoteVectorStoreFileDeleted,
      vectorStoreFileId: input.vectorStoreFileId,
      vectorStoreId: input.vectorStoreId,
    });
  }
}

async function recoverFromCatalogPersistenceFailure(input: {
  catalogError: unknown;
  catalogStore: AttachKnowledgeDocumentToVectorStoreDeps["catalogStore"];
  document: AttachableKnowledgeDocument;
  openAI: AttachKnowledgeDocumentToVectorStoreDeps["openAI"];
  phase: "attached" | "failed" | "ready";
  vectorStoreFileId: string;
  vectorStoreId: string;
}): Promise<FailedIndexRecoveryResult> {
  let remoteVectorStoreFileDeleted = false;
  let remoteVectorStoreFileDeleteError: unknown | null = null;
  let recoveredVectorStoreId: string | null = input.vectorStoreId;

  try {
    await deleteVectorStoreFile(
      input.openAI,
      input.vectorStoreId,
      input.vectorStoreFileId,
    );
    remoteVectorStoreFileDeleted = true;
    recoveredVectorStoreId = null;
  } catch (error) {
    remoteVectorStoreFileDeleteError = error;
  }

  const failedLastError = buildCatalogPersistenceFailureMessage({
    catalogError: input.catalogError,
    phase: input.phase,
    recoveryError: null,
    remoteVectorStoreFileDeleteError,
    remoteVectorStoreFileDeleted,
    vectorStoreFileId: input.vectorStoreFileId,
    vectorStoreId: input.vectorStoreId,
  });

  let recoveryError: unknown | null = null;

  try {
    await input.catalogStore.recordVectorStoreIndexResult({
      datasetVersion: input.document.datasetVersion,
      docId: input.document.docId,
      documentVersion: input.document.documentVersion,
      lastError: failedLastError,
      lastIndexedAt: getCurrentTimestamp(),
      status: "failed",
      vectorStoreId: recoveredVectorStoreId,
    });
  } catch (error) {
    recoveryError = error;
  }

  return {
    message: buildCatalogPersistenceFailureMessage({
      catalogError: input.catalogError,
      phase: input.phase,
      recoveryError,
      remoteVectorStoreFileDeleteError,
      remoteVectorStoreFileDeleted,
      vectorStoreFileId: input.vectorStoreFileId,
      vectorStoreId: input.vectorStoreId,
    }),
    recoveredVectorStoreId,
    recoveryError,
    remoteVectorStoreFileDeleteError,
    remoteVectorStoreFileDeleted,
  };
}

function createCatalogPersistenceFailureError(input: {
  catalogError: unknown;
  message: string;
  openAIFileId: string;
  recoveredVectorStoreId: string | null;
  recoveryError: unknown | null;
  remoteVectorStoreFileDeleteError: unknown | null;
  remoteVectorStoreFileDeleted: boolean;
  vectorStoreFileId: string;
  vectorStoreId: string;
}) {
  return new AttachKnowledgeDocumentToVectorStoreError({
    cause: {
      catalogError: input.catalogError,
      recoveredVectorStoreId: input.recoveredVectorStoreId,
      recoveryError: input.recoveryError,
      remoteVectorStoreFileDeleteError: input.remoteVectorStoreFileDeleteError,
      remoteVectorStoreFileDeleted: input.remoteVectorStoreFileDeleted,
    },
    code: "catalog_record_failed",
    message: input.message,
    openAIFileId: input.openAIFileId,
    vectorStoreFileId: input.vectorStoreFileId,
    vectorStoreId: input.vectorStoreId,
  });
}

export function createAttachKnowledgeDocumentToVectorStore(
  deps: AttachKnowledgeDocumentToVectorStoreDeps,
) {
  return async function attachKnowledgeDocumentToVectorStore(
    input: AttachKnowledgeDocumentToVectorStoreInput,
  ): Promise<AttachKnowledgeDocumentToVectorStoreResult> {
    const parsedInput =
      attachKnowledgeDocumentToVectorStoreInputSchema.parse(input);
    const document = await loadAttachableDocument(
      parsedInput,
      deps.catalogStore,
    );
    const vectorStoreRegistration = await loadVectorStoreRegistration(
      document.datasetVersion,
      deps.registryStore,
    );
    const vectorStoreAttributes =
      buildKnowledgeDocumentVectorStoreFileAttributes(document);
    const attachAttemptedAt = getCurrentTimestamp();

    let createdVectorStoreFile: OpenAIVectorStoreFileCreateResult;

    try {
      createdVectorStoreFile = await deps.openAI.createVectorStoreFile(
        vectorStoreRegistration.vectorStoreId,
        {
          attributes: vectorStoreAttributes,
          file_id: document.openAIFileId,
        },
      );
    } catch (error) {
      const attachError = createOperationalError({
        code: "openai_vector_store_attach_failed",
        error,
        openAIFileId: document.openAIFileId,
        vectorStoreFileId: document.openAIFileId,
        vectorStoreId: vectorStoreRegistration.vectorStoreId,
      });

      await recordFailedIndexResult(
        deps.catalogStore,
        document,
        {
          lastError: attachError.message,
          lastIndexedAt: attachAttemptedAt,
          vectorStoreId: vectorStoreRegistration.vectorStoreId,
        },
        attachError,
      );

      throw attachError;
    }

    const vectorStoreFileId = getVectorStoreFileId(
      createdVectorStoreFile,
      document.openAIFileId,
    );

    try {
      await deps.catalogStore.recordVectorStoreIndexResult({
        datasetVersion: document.datasetVersion,
        docId: document.docId,
        documentVersion: document.documentVersion,
        lastError: null,
        lastIndexedAt: null,
        status: "attached",
        vectorStoreId: vectorStoreRegistration.vectorStoreId,
      });
    } catch (catalogError) {
      const recovery = await recoverFromCatalogPersistenceFailure({
        catalogError,
        catalogStore: deps.catalogStore,
        document,
        openAI: deps.openAI,
        phase: "attached",
        vectorStoreFileId,
        vectorStoreId: vectorStoreRegistration.vectorStoreId,
      });

      throw createCatalogPersistenceFailureError({
        catalogError,
        message: recovery.message,
        openAIFileId: document.openAIFileId,
        recoveredVectorStoreId: recovery.recoveredVectorStoreId,
        recoveryError: recovery.recoveryError,
        remoteVectorStoreFileDeleteError:
          recovery.remoteVectorStoreFileDeleteError,
        remoteVectorStoreFileDeleted: recovery.remoteVectorStoreFileDeleted,
        vectorStoreFileId,
        vectorStoreId: vectorStoreRegistration.vectorStoreId,
      });
    }

    let polledVectorStoreFile: OpenAIVectorStoreFilePollResult;

    try {
      polledVectorStoreFile = await deps.openAI.pollVectorStoreFile(
        vectorStoreRegistration.vectorStoreId,
        vectorStoreFileId,
      );
    } catch (error) {
      const pollError = createOperationalError({
        code: "openai_vector_store_poll_failed",
        error,
        openAIFileId: document.openAIFileId,
        vectorStoreFileId,
        vectorStoreId: vectorStoreRegistration.vectorStoreId,
      });

      await recordFailedIndexResultWithRecovery({
        catalogStore: deps.catalogStore,
        document,
        lastError: pollError.message,
        lastIndexedAt: getCurrentTimestamp(),
        openAI: deps.openAI,
        vectorStoreFileId,
        vectorStoreId: vectorStoreRegistration.vectorStoreId,
      });

      throw pollError;
    }

    const lastIndexedAt = getCurrentTimestamp();
    const terminalRequestId =
      getRequestId(polledVectorStoreFile) ??
      getRequestId(createdVectorStoreFile);

    if (polledVectorStoreFile.status !== "completed") {
      const processingError = createTerminalProcessingError({
        openAIFileId: document.openAIFileId,
        vectorStoreFile: polledVectorStoreFile,
        vectorStoreId: vectorStoreRegistration.vectorStoreId,
      });

      await recordFailedIndexResultWithRecovery({
        catalogStore: deps.catalogStore,
        document,
        lastError: processingError.message,
        lastIndexedAt,
        openAI: deps.openAI,
        vectorStoreFileId,
        vectorStoreId: vectorStoreRegistration.vectorStoreId,
      });

      throw processingError;
    }

    try {
      await deps.catalogStore.recordVectorStoreIndexResult({
        datasetVersion: document.datasetVersion,
        docId: document.docId,
        documentVersion: document.documentVersion,
        lastError: null,
        lastIndexedAt,
        status: "ready",
        vectorStoreId: vectorStoreRegistration.vectorStoreId,
      });
    } catch (catalogError) {
      const recovery = await recoverFromCatalogPersistenceFailure({
        catalogError,
        catalogStore: deps.catalogStore,
        document,
        openAI: deps.openAI,
        phase: "ready",
        vectorStoreFileId,
        vectorStoreId: vectorStoreRegistration.vectorStoreId,
      });

      throw createCatalogPersistenceFailureError({
        catalogError,
        message: recovery.message,
        openAIFileId: document.openAIFileId,
        recoveredVectorStoreId: recovery.recoveredVectorStoreId,
        recoveryError: recovery.recoveryError,
        remoteVectorStoreFileDeleteError:
          recovery.remoteVectorStoreFileDeleteError,
        remoteVectorStoreFileDeleted: recovery.remoteVectorStoreFileDeleted,
        vectorStoreFileId,
        vectorStoreId: vectorStoreRegistration.vectorStoreId,
      });
    }

    return {
      document: {
        canonicalPath: document.canonicalPath,
        datasetVersion: document.datasetVersion,
        docId: document.docId,
        documentVersion: document.documentVersion,
        openAIFileId: document.openAIFileId,
        status: "ready",
      },
      vectorStore: {
        attributes: vectorStoreAttributes,
        fileId: vectorStoreFileId,
        id: vectorStoreRegistration.vectorStoreId,
        lastIndexedAt,
        name: vectorStoreRegistration.name,
        requestId: terminalRequestId,
        status: "completed",
      },
    };
  };
}
