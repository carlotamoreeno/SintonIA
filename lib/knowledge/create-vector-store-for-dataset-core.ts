import { z } from "zod";
import {
  OpenAIAdapterError,
  type OpenAIAdapter,
} from "@/lib/openai/adapter-core";
import type {
  KnowledgeVectorStoreRegistration,
  KnowledgeVectorStoreRegistrationStore,
} from "@/lib/supabase/knowledge-vector-store-registry-core";

const createOrRegisterVectorStoreForDatasetInputSchema = z.object({
  datasetVersion: z.string().trim().min(1),
  existingVectorStoreId: z.string().trim().min(1).optional(),
  name: z.string().trim().min(1).optional(),
});

type CreateOrRegisterVectorStoreForDatasetClient = Pick<
  OpenAIAdapter,
  "createVectorStore" | "deleteVectorStore" | "retrieveVectorStore"
>;

export type CreateOrRegisterVectorStoreForDatasetInput = z.input<
  typeof createOrRegisterVectorStoreForDatasetInputSchema
>;

export type CreateOrRegisterVectorStoreForDatasetResult = {
  registration: KnowledgeVectorStoreRegistration;
  vectorStore: {
    created: boolean;
    id: string;
    name: string;
    requestId: string | null;
    source: "created_remote" | "existing_registry" | "existing_remote";
  };
};

export type CreateOrRegisterVectorStoreForDatasetDeps = {
  openAI: CreateOrRegisterVectorStoreForDatasetClient;
  registryStore: KnowledgeVectorStoreRegistrationStore;
};

export type CreateOrRegisterVectorStoreForDatasetErrorCode =
  | "openai_vector_store_create_failed"
  | "openai_vector_store_retrieve_failed"
  | "registry_record_failed"
  | "vector_store_already_registered";

type CreateOrRegisterVectorStoreForDatasetErrorInput = {
  cause?: unknown;
  code: CreateOrRegisterVectorStoreForDatasetErrorCode;
  message: string;
  vectorStoreId?: string | null;
};

export class CreateOrRegisterVectorStoreForDatasetError extends Error {
  override readonly cause: unknown;
  readonly code: CreateOrRegisterVectorStoreForDatasetErrorCode;
  readonly vectorStoreId: string | null | undefined;

  constructor(input: CreateOrRegisterVectorStoreForDatasetErrorInput) {
    super(input.message);
    this.name = "CreateOrRegisterVectorStoreForDatasetError";
    this.code = input.code;
    this.vectorStoreId = input.vectorStoreId;
    this.cause = input.cause;
  }
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  if (typeof error === "string" && error.trim().length > 0) {
    return error;
  }

  return "Vector store registration failed.";
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

function getVectorStoreName(value: unknown) {
  if (
    typeof value === "object" &&
    value !== null &&
    "name" in value &&
    typeof value.name === "string" &&
    value.name.trim().length > 0
  ) {
    return value.name;
  }

  return null;
}

function createOpenAIRequestError(
  code:
    | "openai_vector_store_create_failed"
    | "openai_vector_store_retrieve_failed",
  error: unknown,
  vectorStoreId?: string | null,
) {
  return new CreateOrRegisterVectorStoreForDatasetError({
    cause: error,
    code,
    message: getDetailedErrorMessage(error),
    vectorStoreId,
  });
}

function createRegistryRecordFailureError(input: {
  cleanupError: unknown | null;
  remoteDeleted: boolean;
  registryError: unknown;
  vectorStoreId: string;
}) {
  const baseMessage = `OpenAI vector store ${input.vectorStoreId} could not be recorded in knowledge_vector_store_registry: ${getDetailedErrorMessage(input.registryError)}.`;

  if (input.remoteDeleted) {
    return new CreateOrRegisterVectorStoreForDatasetError({
      cause: {
        cleanupError: input.cleanupError,
        registryError: input.registryError,
      },
      code: "registry_record_failed",
      message: `${baseMessage} Remote vector store deleted successfully.`,
      vectorStoreId: input.vectorStoreId,
    });
  }

  if (input.cleanupError) {
    return new CreateOrRegisterVectorStoreForDatasetError({
      cause: {
        cleanupError: input.cleanupError,
        registryError: input.registryError,
      },
      code: "registry_record_failed",
      message: `${baseMessage} Remote cleanup failed: ${getDetailedErrorMessage(input.cleanupError)}. Manual cleanup is required.`,
      vectorStoreId: input.vectorStoreId,
    });
  }

  return new CreateOrRegisterVectorStoreForDatasetError({
    cause: input.registryError,
    code: "registry_record_failed",
    message: baseMessage,
    vectorStoreId: input.vectorStoreId,
  });
}

export function buildKnowledgeVectorStoreName(datasetVersion: string) {
  return `sintonia-${datasetVersion}`;
}

export function createVectorStoreMetadata(datasetVersion: string) {
  return {
    app: "sintonia",
    dataset_version: datasetVersion,
  } as const;
}

export function createCreateOrRegisterVectorStoreForDataset(
  deps: CreateOrRegisterVectorStoreForDatasetDeps,
) {
  return async function createOrRegisterVectorStoreForDataset(
    input: CreateOrRegisterVectorStoreForDatasetInput,
  ): Promise<CreateOrRegisterVectorStoreForDatasetResult> {
    const parsedInput =
      createOrRegisterVectorStoreForDatasetInputSchema.parse(input);
    const existingRegistration = await deps.registryStore.findByDatasetVersion(
      parsedInput.datasetVersion,
    );

    if (existingRegistration) {
      return {
        registration: existingRegistration,
        vectorStore: {
          created: false,
          id: existingRegistration.vectorStoreId,
          name: existingRegistration.name,
          requestId: null,
          source: "existing_registry",
        },
      };
    }

    if (parsedInput.existingVectorStoreId) {
      const existingVectorStoreRegistration =
        await deps.registryStore.findByVectorStoreId(
          parsedInput.existingVectorStoreId,
        );

      if (existingVectorStoreRegistration) {
        throw new CreateOrRegisterVectorStoreForDatasetError({
          code: "vector_store_already_registered",
          message: `OpenAI vector store ${parsedInput.existingVectorStoreId} is already registered for dataset ${existingVectorStoreRegistration.datasetVersion}.`,
          vectorStoreId: parsedInput.existingVectorStoreId,
        });
      }

      let remoteVectorStore;

      try {
        remoteVectorStore = await deps.openAI.retrieveVectorStore(
          parsedInput.existingVectorStoreId,
        );
      } catch (error) {
        throw createOpenAIRequestError(
          "openai_vector_store_retrieve_failed",
          error,
          parsedInput.existingVectorStoreId,
        );
      }

      const name =
        parsedInput.name ??
        getVectorStoreName(remoteVectorStore) ??
        buildKnowledgeVectorStoreName(parsedInput.datasetVersion);
      let registration;

      try {
        registration = await deps.registryStore.createRegistration({
          datasetVersion: parsedInput.datasetVersion,
          name,
          vectorStoreId: parsedInput.existingVectorStoreId,
        });
      } catch (registryError) {
        throw createRegistryRecordFailureError({
          cleanupError: null,
          registryError,
          remoteDeleted: false,
          vectorStoreId: parsedInput.existingVectorStoreId,
        });
      }

      return {
        registration,
        vectorStore: {
          created: false,
          id: registration.vectorStoreId,
          name,
          requestId: getRequestId(remoteVectorStore),
          source: "existing_remote",
        },
      };
    }

    const name =
      parsedInput.name ??
      buildKnowledgeVectorStoreName(parsedInput.datasetVersion);

    let remoteVectorStore;

    try {
      remoteVectorStore = await deps.openAI.createVectorStore({
        metadata: createVectorStoreMetadata(parsedInput.datasetVersion),
        name,
      });
    } catch (error) {
      throw createOpenAIRequestError(
        "openai_vector_store_create_failed",
        error,
      );
    }

    const vectorStoreId =
      typeof remoteVectorStore.id === "string" ? remoteVectorStore.id : null;

    if (!vectorStoreId) {
      throw new CreateOrRegisterVectorStoreForDatasetError({
        code: "openai_vector_store_create_failed",
        message: "OpenAI vector store creation returned an invalid id.",
        vectorStoreId: null,
      });
    }

    try {
      const registration = await deps.registryStore.createRegistration({
        datasetVersion: parsedInput.datasetVersion,
        name,
        vectorStoreId,
      });

      return {
        registration,
        vectorStore: {
          created: true,
          id: vectorStoreId,
          name,
          requestId: getRequestId(remoteVectorStore),
          source: "created_remote",
        },
      };
    } catch (registryError) {
      let cleanupError: unknown | null = null;
      let remoteDeleted = false;

      try {
        await deps.openAI.deleteVectorStore(vectorStoreId);
        remoteDeleted = true;
      } catch (error) {
        cleanupError = error;
      }

      throw createRegistryRecordFailureError({
        cleanupError,
        registryError,
        remoteDeleted,
        vectorStoreId,
      });
    }
  };
}
