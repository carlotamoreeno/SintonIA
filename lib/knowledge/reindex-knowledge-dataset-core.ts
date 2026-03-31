import { z } from "zod";
import { knowledgeDocumentMetadataSchema } from "./document-metadata";
import type {
  KnowledgeDocumentCatalogDocument,
  KnowledgeDocumentCatalogStatus,
  KnowledgeDocumentCatalogStore,
} from "@/lib/supabase/knowledge-document-store-core";
import type { KnowledgeVectorStoreRegistrationStore } from "@/lib/supabase/knowledge-vector-store-registry-core";
import {
  ReindexKnowledgeDocumentError,
  type ReindexKnowledgeDocumentInput,
  type ReindexKnowledgeDocumentResult,
} from "./reindex-knowledge-document-core";

export const MAX_MANUAL_DATASET_REINDEX_DOCUMENTS = 25;

const reindexKnowledgeDatasetInputSchema = knowledgeDocumentMetadataSchema
  .pick({
    datasetVersion: true,
  })
  .extend({
    limit: z
      .number()
      .int()
      .positive()
      .max(MAX_MANUAL_DATASET_REINDEX_DOCUMENTS)
      .default(MAX_MANUAL_DATASET_REINDEX_DOCUMENTS),
  });

export type ReindexKnowledgeDatasetInput = z.input<
  typeof reindexKnowledgeDatasetInputSchema
>;

type ReindexKnowledgeDatasetDocumentRef = {
  canonicalPath: string;
  datasetVersion: string;
  docId: string;
  documentVersion: number;
  openAIFileId: string | null;
  status: KnowledgeDocumentCatalogStatus;
};

export type ReindexKnowledgeDatasetSkippedCode =
  | "document_not_uploaded"
  | "document_retired";

type ReindexKnowledgeDatasetFailureCode =
  | ReindexKnowledgeDocumentError["code"]
  | "unexpected_error";

export type ReindexKnowledgeDatasetResultItem =
  | {
      document: ReindexKnowledgeDatasetDocumentRef;
      reindex: ReindexKnowledgeDocumentResult["reindex"];
      status: "success";
      vectorStore: ReindexKnowledgeDocumentResult["vectorStore"];
    }
  | {
      document: ReindexKnowledgeDatasetDocumentRef;
      error: {
        code: ReindexKnowledgeDatasetFailureCode;
        message: string;
        openAIFileId: string | null;
        vectorStoreId: string | null;
      };
      status: "failed";
    }
  | {
      document: ReindexKnowledgeDatasetDocumentRef;
      skip: {
        code: ReindexKnowledgeDatasetSkippedCode;
        message: string;
      };
      status: "skipped";
    };

export type ReindexKnowledgeDatasetResult = {
  datasetVersion: string;
  failureCount: number;
  limit: number;
  processedCount: number;
  results: ReindexKnowledgeDatasetResultItem[];
  skippedCount: number;
  successCount: number;
  vectorStoreId: string;
};

export type ReindexKnowledgeDatasetDeps = {
  catalogStore: Pick<
    KnowledgeDocumentCatalogStore,
    "findDocumentsByDatasetVersion"
  >;
  registryStore: Pick<
    KnowledgeVectorStoreRegistrationStore,
    "findByDatasetVersion"
  >;
  reindexKnowledgeDocument(
    input: ReindexKnowledgeDocumentInput,
  ): Promise<ReindexKnowledgeDocumentResult>;
};

export type ReindexKnowledgeDatasetErrorCode =
  | "catalog_documents_lookup_failed"
  | "vector_store_not_registered";

type ReindexKnowledgeDatasetErrorInput = {
  cause?: unknown;
  code: ReindexKnowledgeDatasetErrorCode;
  message: string;
  vectorStoreId?: string | null;
};

export class ReindexKnowledgeDatasetError extends Error {
  override readonly cause: unknown;
  readonly code: ReindexKnowledgeDatasetErrorCode;
  readonly vectorStoreId: string | null | undefined;

  constructor(input: ReindexKnowledgeDatasetErrorInput) {
    super(input.message);
    this.name = "ReindexKnowledgeDatasetError";
    this.code = input.code;
    this.cause = input.cause;
    this.vectorStoreId = input.vectorStoreId;
  }
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  if (typeof error === "string" && error.trim().length > 0) {
    return error;
  }

  return "Knowledge dataset reindex failed.";
}

function toDocumentRef(
  document: KnowledgeDocumentCatalogDocument,
): ReindexKnowledgeDatasetDocumentRef {
  return {
    canonicalPath: document.canonicalPath,
    datasetVersion: document.datasetVersion,
    docId: document.docId,
    documentVersion: document.documentVersion,
    openAIFileId: document.openAIFileId,
    status: document.status,
  };
}

function createSkippedResult(
  document: KnowledgeDocumentCatalogDocument,
  code: ReindexKnowledgeDatasetSkippedCode,
  message: string,
): ReindexKnowledgeDatasetResultItem {
  return {
    document: toDocumentRef(document),
    skip: {
      code,
      message,
    },
    status: "skipped",
  };
}

function getSkipResult(document: KnowledgeDocumentCatalogDocument) {
  if (document.status === "retired") {
    return createSkippedResult(
      document,
      "document_retired",
      `Knowledge document ${document.datasetVersion}/${document.docId}/v${document.documentVersion} is retired and cannot be reindexed.`,
    );
  }

  if (!document.openAIFileId) {
    return createSkippedResult(
      document,
      "document_not_uploaded",
      `Knowledge document ${document.datasetVersion}/${document.docId}/v${document.documentVersion} does not have an openai_file_id yet.`,
    );
  }

  return null;
}

function createFailedResult(
  document: KnowledgeDocumentCatalogDocument,
  error: unknown,
): ReindexKnowledgeDatasetResultItem {
  if (error instanceof ReindexKnowledgeDocumentError) {
    return {
      document: toDocumentRef(document),
      error: {
        code: error.code,
        message: error.message,
        openAIFileId: error.openAIFileId ?? document.openAIFileId,
        vectorStoreId: error.vectorStoreId ?? document.vectorStoreId,
      },
      status: "failed",
    };
  }

  return {
    document: toDocumentRef(document),
    error: {
      code: "unexpected_error",
      message: getErrorMessage(error),
      openAIFileId: document.openAIFileId,
      vectorStoreId: document.vectorStoreId,
    },
    status: "failed",
  };
}

export function createReindexKnowledgeDataset(
  deps: ReindexKnowledgeDatasetDeps,
) {
  return async function reindexKnowledgeDataset(
    input: ReindexKnowledgeDatasetInput,
  ): Promise<ReindexKnowledgeDatasetResult> {
    const parsedInput = reindexKnowledgeDatasetInputSchema.parse(input);
    const registration = await deps.registryStore.findByDatasetVersion(
      parsedInput.datasetVersion,
    );

    if (!registration) {
      throw new ReindexKnowledgeDatasetError({
        code: "vector_store_not_registered",
        message: `No vector store is registered for dataset_version=${parsedInput.datasetVersion}.`,
        vectorStoreId: null,
      });
    }

    let documents: KnowledgeDocumentCatalogDocument[];

    try {
      documents = await deps.catalogStore.findDocumentsByDatasetVersion({
        datasetVersion: parsedInput.datasetVersion,
        limit: parsedInput.limit,
      });
    } catch (error) {
      throw new ReindexKnowledgeDatasetError({
        cause: error,
        code: "catalog_documents_lookup_failed",
        message: getErrorMessage(error),
        vectorStoreId: registration.vectorStoreId,
      });
    }

    const results: ReindexKnowledgeDatasetResultItem[] = [];

    for (const document of documents) {
      const skippedResult = getSkipResult(document);

      if (skippedResult) {
        results.push(skippedResult);
        continue;
      }

      try {
        const result = await deps.reindexKnowledgeDocument({
          datasetVersion: document.datasetVersion,
          docId: document.docId,
          documentVersion: document.documentVersion,
        });

        results.push({
          document: toDocumentRef(document),
          reindex: result.reindex,
          status: "success",
          vectorStore: result.vectorStore,
        });
      } catch (error) {
        results.push(createFailedResult(document, error));
      }
    }

    const successCount = results.filter(
      (result) => result.status === "success",
    ).length;
    const failureCount = results.filter(
      (result) => result.status === "failed",
    ).length;
    const skippedCount = results.filter(
      (result) => result.status === "skipped",
    ).length;

    return {
      datasetVersion: parsedInput.datasetVersion,
      failureCount,
      limit: parsedInput.limit,
      processedCount: results.length,
      results,
      skippedCount,
      successCount,
      vectorStoreId: registration.vectorStoreId,
    };
  };
}
