import type {
  KnowledgeVectorStoreRegistration,
  KnowledgeVectorStoreRegistrationStore,
} from "@/lib/supabase/knowledge-vector-store-registry-core";

export type ActiveKnowledgeDatasetResolution = {
  activatedAt: string | null;
  datasetVersion: string;
  source: "active_registry" | "env_fallback";
  vectorStoreId: string;
};

export type ActiveKnowledgeDatasetResolver = {
  resolveActiveDataset(): Promise<ActiveKnowledgeDatasetResolution>;
};

export type ActiveKnowledgeDatasetResolverDeps = {
  fallbackDatasetVersion: string | null;
  registryStore: Pick<
    KnowledgeVectorStoreRegistrationStore,
    "findActiveRegistration" | "findByDatasetVersion"
  >;
};

export type ActiveKnowledgeDatasetErrorCode =
  | "active_dataset_not_configured"
  | "active_dataset_lookup_failed"
  | "fallback_dataset_not_registered";

type ActiveKnowledgeDatasetErrorInput = {
  cause?: unknown;
  code: ActiveKnowledgeDatasetErrorCode;
  datasetVersion?: string | null;
  message: string;
};

export class ActiveKnowledgeDatasetError extends Error {
  override readonly cause: unknown;
  readonly code: ActiveKnowledgeDatasetErrorCode;
  readonly datasetVersion: string | null;

  constructor(input: ActiveKnowledgeDatasetErrorInput) {
    super(input.message);
    this.name = "ActiveKnowledgeDatasetError";
    this.cause = input.cause;
    this.code = input.code;
    this.datasetVersion = input.datasetVersion ?? null;
  }
}

function toResolution(
  registration: KnowledgeVectorStoreRegistration,
  source: ActiveKnowledgeDatasetResolution["source"],
): ActiveKnowledgeDatasetResolution {
  return {
    activatedAt: registration.activatedAt,
    datasetVersion: registration.datasetVersion,
    source,
    vectorStoreId: registration.vectorStoreId,
  };
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  if (typeof error === "string" && error.trim().length > 0) {
    return error;
  }

  return "Active knowledge dataset lookup failed.";
}

export function createActiveKnowledgeDatasetResolver(
  deps: ActiveKnowledgeDatasetResolverDeps,
): ActiveKnowledgeDatasetResolver {
  return {
    async resolveActiveDataset() {
      let activeRegistration: KnowledgeVectorStoreRegistration | null;

      try {
        activeRegistration = await deps.registryStore.findActiveRegistration();
      } catch (error) {
        throw new ActiveKnowledgeDatasetError({
          cause: error,
          code: "active_dataset_lookup_failed",
          message: getErrorMessage(error),
        });
      }

      if (activeRegistration) {
        return toResolution(activeRegistration, "active_registry");
      }

      if (!deps.fallbackDatasetVersion) {
        throw new ActiveKnowledgeDatasetError({
          code: "active_dataset_not_configured",
          message: "No active knowledge dataset is configured.",
        });
      }

      let fallbackRegistration: KnowledgeVectorStoreRegistration | null;

      try {
        fallbackRegistration = await deps.registryStore.findByDatasetVersion(
          deps.fallbackDatasetVersion,
        );
      } catch (error) {
        throw new ActiveKnowledgeDatasetError({
          cause: error,
          code: "active_dataset_lookup_failed",
          datasetVersion: deps.fallbackDatasetVersion,
          message: getErrorMessage(error),
        });
      }

      if (!fallbackRegistration) {
        throw new ActiveKnowledgeDatasetError({
          code: "fallback_dataset_not_registered",
          datasetVersion: deps.fallbackDatasetVersion,
          message: `No vector store is registered for ACTIVE_DATASET_VERSION=${deps.fallbackDatasetVersion}.`,
        });
      }

      return toResolution(fallbackRegistration, "env_fallback");
    },
  };
}
