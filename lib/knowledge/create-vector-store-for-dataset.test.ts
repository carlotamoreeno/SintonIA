import { describe, expect, it, vi } from "vitest";
import {
  buildKnowledgeVectorStoreName,
  createCreateOrRegisterVectorStoreForDataset,
} from "./create-vector-store-for-dataset-core";

function createRegistration(overrides?: Record<string, unknown>) {
  return {
    activatedAt: null,
    activatedByUserId: null,
    createdAt: "2026-03-31T08:00:00.000Z",
    datasetVersion: "mvp-2026-03",
    id: "registry-row-1",
    isActive: false,
    name: "sintonia-mvp-2026-03",
    updatedAt: "2026-03-31T08:00:00.000Z",
    vectorStoreId: "vs_123",
    ...overrides,
  };
}

function createDeps() {
  const activateDataset = vi.fn();
  const createRegistration = vi.fn();
  const findActiveRegistration = vi.fn().mockResolvedValue(null);
  const findByDatasetVersion = vi.fn().mockResolvedValue(null);
  const findByVectorStoreId = vi.fn().mockResolvedValue(null);
  const listRegistrations = vi.fn().mockResolvedValue([]);
  const createVectorStore = vi.fn().mockResolvedValue({
    _request_id: "req_create_123",
    id: "vs_created_123",
    name: "sintonia-mvp-2026-03",
  });
  const deleteVectorStore = vi.fn().mockResolvedValue({
    deleted: true,
    id: "vs_created_123",
  });
  const retrieveVectorStore = vi.fn().mockResolvedValue({
    _request_id: "req_retrieve_123",
    id: "vs_existing_123",
    name: "Existing MVP Store",
  });

  return {
    openAI: {
      createVectorStore,
      deleteVectorStore,
      retrieveVectorStore,
    },
    registryStore: {
      activateDataset,
      createRegistration,
      findActiveRegistration,
      findByDatasetVersion,
      findByVectorStoreId,
      listRegistrations,
    },
    spies: {
      activateDataset,
      createRegistration,
      createVectorStore,
      deleteVectorStore,
      findActiveRegistration,
      findByDatasetVersion,
      findByVectorStoreId,
      listRegistrations,
      retrieveVectorStore,
    },
  };
}

describe("createCreateOrRegisterVectorStoreForDataset", () => {
  it("returns an existing registration without mutating anything", async () => {
    const deps = createDeps();
    deps.spies.findByDatasetVersion.mockResolvedValueOnce(
      createRegistration({
        vectorStoreId: "vs_existing_123",
      }),
    );
    const createOrRegisterVectorStoreForDataset =
      createCreateOrRegisterVectorStoreForDataset(deps);

    const result = await createOrRegisterVectorStoreForDataset({
      datasetVersion: "mvp-2026-03",
    });

    expect(deps.spies.createVectorStore).not.toHaveBeenCalled();
    expect(deps.spies.retrieveVectorStore).not.toHaveBeenCalled();
    expect(deps.spies.createRegistration).not.toHaveBeenCalled();
    expect(result).toEqual({
      registration: createRegistration({
        vectorStoreId: "vs_existing_123",
      }),
      vectorStore: {
        created: false,
        id: "vs_existing_123",
        name: "sintonia-mvp-2026-03",
        requestId: null,
        source: "existing_registry",
      },
    });
  });

  it("registers an existing remote vector store without creating a new one", async () => {
    const deps = createDeps();
    deps.spies.createRegistration.mockResolvedValueOnce(
      createRegistration({
        name: "Existing MVP Store",
        vectorStoreId: "vs_existing_123",
      }),
    );
    const createOrRegisterVectorStoreForDataset =
      createCreateOrRegisterVectorStoreForDataset(deps);

    const result = await createOrRegisterVectorStoreForDataset({
      datasetVersion: "mvp-2026-03",
      existingVectorStoreId: "vs_existing_123",
    });

    expect(deps.spies.retrieveVectorStore).toHaveBeenCalledWith(
      "vs_existing_123",
    );
    expect(deps.spies.createRegistration).toHaveBeenCalledWith({
      datasetVersion: "mvp-2026-03",
      name: "Existing MVP Store",
      vectorStoreId: "vs_existing_123",
    });
    expect(deps.spies.createVectorStore).not.toHaveBeenCalled();
    expect(result).toEqual({
      registration: createRegistration({
        name: "Existing MVP Store",
        vectorStoreId: "vs_existing_123",
      }),
      vectorStore: {
        created: false,
        id: "vs_existing_123",
        name: "Existing MVP Store",
        requestId: "req_retrieve_123",
        source: "existing_remote",
      },
    });
  });

  it("returns a structured error when an existing remote vector store cannot be registered", async () => {
    const deps = createDeps();
    deps.spies.createRegistration.mockRejectedValueOnce(
      new Error("duplicate key value"),
    );
    const createOrRegisterVectorStoreForDataset =
      createCreateOrRegisterVectorStoreForDataset(deps);

    const error = await createOrRegisterVectorStoreForDataset({
      datasetVersion: "mvp-2026-03",
      existingVectorStoreId: "vs_existing_123",
    }).catch((cause) => cause);

    expect(error).toMatchObject({
      code: "registry_record_failed",
      message:
        "OpenAI vector store vs_existing_123 could not be recorded in knowledge_vector_store_registry: duplicate key value.",
      vectorStoreId: "vs_existing_123",
    });
  });

  it("creates and registers a new vector store when no existing id is provided", async () => {
    const deps = createDeps();
    deps.spies.createRegistration.mockResolvedValueOnce(
      createRegistration({
        vectorStoreId: "vs_created_123",
      }),
    );
    const createOrRegisterVectorStoreForDataset =
      createCreateOrRegisterVectorStoreForDataset(deps);

    const result = await createOrRegisterVectorStoreForDataset({
      datasetVersion: "mvp-2026-03",
    });

    expect(deps.spies.createVectorStore).toHaveBeenCalledWith({
      metadata: {
        app: "sintonia",
        dataset_version: "mvp-2026-03",
      },
      name: buildKnowledgeVectorStoreName("mvp-2026-03"),
    });
    expect(deps.spies.createRegistration).toHaveBeenCalledWith({
      datasetVersion: "mvp-2026-03",
      name: "sintonia-mvp-2026-03",
      vectorStoreId: "vs_created_123",
    });
    expect(result).toEqual({
      registration: createRegistration({
        vectorStoreId: "vs_created_123",
      }),
      vectorStore: {
        created: true,
        id: "vs_created_123",
        name: "sintonia-mvp-2026-03",
        requestId: "req_create_123",
        source: "created_remote",
      },
    });
  });

  it("deletes a newly created remote vector store when registry persistence fails", async () => {
    const deps = createDeps();
    deps.spies.createRegistration.mockRejectedValueOnce(
      new Error("duplicate key value"),
    );
    const createOrRegisterVectorStoreForDataset =
      createCreateOrRegisterVectorStoreForDataset(deps);

    const error = await createOrRegisterVectorStoreForDataset({
      datasetVersion: "mvp-2026-03",
    }).catch((cause) => cause);

    expect(deps.spies.deleteVectorStore).toHaveBeenCalledWith("vs_created_123");
    expect(error).toMatchObject({
      code: "registry_record_failed",
      message:
        "OpenAI vector store vs_created_123 could not be recorded in knowledge_vector_store_registry: duplicate key value. Remote vector store deleted successfully.",
      vectorStoreId: "vs_created_123",
    });
  });

  it("preserves the created vector store id when remote cleanup fails", async () => {
    const deps = createDeps();
    deps.spies.createRegistration.mockRejectedValueOnce(
      new Error("duplicate key value"),
    );
    deps.spies.deleteVectorStore.mockRejectedValueOnce(
      new Error("cleanup failed"),
    );
    const createOrRegisterVectorStoreForDataset =
      createCreateOrRegisterVectorStoreForDataset(deps);

    const error = await createOrRegisterVectorStoreForDataset({
      datasetVersion: "mvp-2026-03",
    }).catch((cause) => cause);

    expect(error).toMatchObject({
      code: "registry_record_failed",
      message:
        "OpenAI vector store vs_created_123 could not be recorded in knowledge_vector_store_registry: duplicate key value. Remote cleanup failed: cleanup failed. Manual cleanup is required.",
      vectorStoreId: "vs_created_123",
    });
  });

  it("rejects an existing vector store id that is already registered for another dataset", async () => {
    const deps = createDeps();
    deps.spies.findByVectorStoreId.mockResolvedValueOnce(
      createRegistration({
        datasetVersion: "legacy-2026-02",
        vectorStoreId: "vs_existing_123",
      }),
    );
    const createOrRegisterVectorStoreForDataset =
      createCreateOrRegisterVectorStoreForDataset(deps);

    const error = await createOrRegisterVectorStoreForDataset({
      datasetVersion: "mvp-2026-03",
      existingVectorStoreId: "vs_existing_123",
    }).catch((cause) => cause);

    expect(error).toMatchObject({
      code: "vector_store_already_registered",
      message:
        "OpenAI vector store vs_existing_123 is already registered for dataset legacy-2026-02.",
      vectorStoreId: "vs_existing_123",
    });
  });
});
