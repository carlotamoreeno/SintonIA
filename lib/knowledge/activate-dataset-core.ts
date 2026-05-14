import { z } from "zod";
import {
  OpenAIAdapterError,
  type OpenAIAdapter,
} from "@/lib/openai/adapter-core";
import type {
  KnowledgeVectorStoreActivationResult,
  KnowledgeVectorStoreRegistrationStore,
} from "@/lib/supabase/knowledge-vector-store-registry-core";

const activateKnowledgeDatasetInputSchema = z.object({
  activatedByUserId: z.string().trim().min(1).nullable(),
  datasetVersion: z.string().trim().min(1),
});

export type ActivateKnowledgeDatasetInput = z.input<
  typeof activateKnowledgeDatasetInputSchema
>;

export type ActivateKnowledgeDatasetResult = {
  activatedAt: string;
  activeDataset: {
    datasetVersion: string;
    vectorStoreId: string;
  };
  changed: boolean;
  previousDataset: {
    datasetVersion: string;
    vectorStoreId: string;
  } | null;
  vectorStoreId: string;
};

export type ActivateKnowledgeDatasetErrorCode =
  | "activation_record_failed"
  | "vector_store_lookup_failed"
  | "vector_store_not_ready"
  | "vector_store_not_registered";

type ActivateKnowledgeDatasetErrorInput = {
  cause?: unknown;
  code: ActivateKnowledgeDatasetErrorCode;
  message: string;
  vectorStoreId?: string | null;
};

export class ActivateKnowledgeDatasetError extends Error {
  override readonly cause: unknown;
  readonly code: ActivateKnowledgeDatasetErrorCode;
  readonly vectorStoreId: string | null | undefined;

  constructor(input: ActivateKnowledgeDatasetErrorInput) {
    super(input.message);
    this.name = "ActivateKnowledgeDatasetError";
    this.cause = input.cause;
    this.code = input.code;
    this.vectorStoreId = input.vectorStoreId;
  }
}

type ActivateKnowledgeDatasetVectorStore = Awaited<
  ReturnType<OpenAIAdapter["retrieveVectorStore"]>
>;

export type ActivateKnowledgeDatasetDeps = {
  openAI: Pick<OpenAIAdapter, "retrieveVectorStore">;
  registryStore: Pick<
    KnowledgeVectorStoreRegistrationStore,
    "activateDataset" | "findByDatasetVersion"
  >;
};

function isVectorStoreReady(
  vectorStore: Pick<
    ActivateKnowledgeDatasetVectorStore,
    "file_counts" | "status"
  >,
) {
  return (
    vectorStore.status === "completed" && vectorStore.file_counts.completed > 0
  );
}

function getErrorMessage(error: unknown) {
  if (error instanceof OpenAIAdapterError) {
    const parts = [error.message];

    if (error.requestId) {
      parts.push(`request_id=${error.requestId}`);
    }

    if (error.code) {
      parts.push(`code=${error.code}`);
    }

    return parts.join(" | ");
  }

  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  if (typeof error === "string" && error.trim().length > 0) {
    return error;
  }

  return "Knowledge dataset activation failed.";
}

function mapActivationResult(
  result: KnowledgeVectorStoreActivationResult,
): ActivateKnowledgeDatasetResult {
  return {
    activatedAt: result.activatedAt,
    activeDataset: {
      datasetVersion: result.activeDatasetVersion,
      vectorStoreId: result.activeVectorStoreId,
    },
    changed: result.changed,
    previousDataset:
      result.previousDatasetVersion && result.previousVectorStoreId
        ? {
            datasetVersion: result.previousDatasetVersion,
            vectorStoreId: result.previousVectorStoreId,
          }
        : null,
    vectorStoreId: result.activeVectorStoreId,
  };
}

export function createActivateKnowledgeDataset(
  deps: ActivateKnowledgeDatasetDeps,
) {
  return async function activateKnowledgeDataset(
    input: ActivateKnowledgeDatasetInput,
  ): Promise<ActivateKnowledgeDatasetResult> {
    const parsedInput = activateKnowledgeDatasetInputSchema.parse(input);
    const registration = await deps.registryStore.findByDatasetVersion(
      parsedInput.datasetVersion,
    );

    if (!registration) {
      throw new ActivateKnowledgeDatasetError({
        code: "vector_store_not_registered",
        message: `No vector store is registered for dataset_version=${parsedInput.datasetVersion}.`,
        vectorStoreId: null,
      });
    }

    let vectorStore: ActivateKnowledgeDatasetVectorStore;

    try {
      vectorStore = await deps.openAI.retrieveVectorStore(
        registration.vectorStoreId,
      );
    } catch (error) {
      throw new ActivateKnowledgeDatasetError({
        cause: error,
        code: "vector_store_lookup_failed",
        message: `Vector store ${registration.vectorStoreId} could not be loaded for dataset activation: ${getErrorMessage(error)}`,
        vectorStoreId: registration.vectorStoreId,
      });
    }

    if (!isVectorStoreReady(vectorStore)) {
      throw new ActivateKnowledgeDatasetError({
        code: "vector_store_not_ready",
        message: `Vector store ${registration.vectorStoreId} is not ready for dataset activation.`,
        vectorStoreId: registration.vectorStoreId,
      });
    }

    try {
      return mapActivationResult(
        await deps.registryStore.activateDataset({
          activatedByUserId: parsedInput.activatedByUserId,
          datasetVersion: parsedInput.datasetVersion,
        }),
      );
    } catch (error) {
      throw new ActivateKnowledgeDatasetError({
        cause: error,
        code: "activation_record_failed",
        message: getErrorMessage(error),
        vectorStoreId: registration.vectorStoreId,
      });
    }
  };
}
