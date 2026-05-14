import { describe, expect, it, vi } from "vitest";
import { createActivateKnowledgeDataset } from "./activate-dataset-core";

function createReadyVectorStore() {
  return {
    file_counts: {
      cancelled: 0,
      completed: 1,
      failed: 0,
      in_progress: 0,
      total: 1,
    },
    id: "vs_active_123",
    status: "completed",
  };
}

function createRegistration() {
  return {
    activatedAt: null,
    activatedByUserId: null,
    createdAt: "2026-03-31T08:00:00.000Z",
    datasetVersion: "mvp-2026-03",
    id: "registry-row-1",
    isActive: false,
    name: "sintonia-mvp-2026-03",
    updatedAt: "2026-03-31T08:00:00.000Z",
    vectorStoreId: "vs_active_123",
  };
}

function createDeps() {
  const activateDataset = vi.fn().mockResolvedValue({
    activatedAt: "2026-05-14T09:00:00.000Z",
    activeDatasetVersion: "mvp-2026-03",
    activeVectorStoreId: "vs_active_123",
    changed: true,
    previousDatasetVersion: "legacy-2026-02",
    previousVectorStoreId: "vs_legacy_123",
  });
  const findByDatasetVersion = vi.fn().mockResolvedValue(createRegistration());
  const retrieveVectorStore = vi
    .fn()
    .mockResolvedValue(createReadyVectorStore());

  return {
    openAI: {
      retrieveVectorStore,
    },
    registryStore: {
      activateDataset,
      findByDatasetVersion,
    },
    spies: {
      activateDataset,
      findByDatasetVersion,
      retrieveVectorStore,
    },
  };
}

describe("createActivateKnowledgeDataset", () => {
  it("validates readiness outside the activation transaction and records the activation", async () => {
    const deps = createDeps();
    const activateKnowledgeDataset = createActivateKnowledgeDataset(deps);

    const result = await activateKnowledgeDataset({
      activatedByUserId: "user-1",
      datasetVersion: " mvp-2026-03 ",
    });

    expect(deps.spies.findByDatasetVersion).toHaveBeenCalledWith("mvp-2026-03");
    expect(deps.spies.retrieveVectorStore).toHaveBeenCalledWith(
      "vs_active_123",
    );
    expect(deps.spies.activateDataset).toHaveBeenCalledWith({
      activatedByUserId: "user-1",
      datasetVersion: "mvp-2026-03",
    });
    expect(result).toEqual({
      activatedAt: "2026-05-14T09:00:00.000Z",
      activeDataset: {
        datasetVersion: "mvp-2026-03",
        vectorStoreId: "vs_active_123",
      },
      changed: true,
      previousDataset: {
        datasetVersion: "legacy-2026-02",
        vectorStoreId: "vs_legacy_123",
      },
      vectorStoreId: "vs_active_123",
    });
  });

  it("rejects datasets without a registered vector store", async () => {
    const deps = createDeps();
    deps.spies.findByDatasetVersion.mockResolvedValueOnce(null);
    const activateKnowledgeDataset = createActivateKnowledgeDataset(deps);

    await expect(
      activateKnowledgeDataset({
        activatedByUserId: "user-1",
        datasetVersion: "missing-2026-03",
      }),
    ).rejects.toMatchObject({
      code: "vector_store_not_registered",
      vectorStoreId: null,
    });
    expect(deps.spies.retrieveVectorStore).not.toHaveBeenCalled();
    expect(deps.spies.activateDataset).not.toHaveBeenCalled();
  });

  it("rejects vector stores that are not completed or have no completed files", async () => {
    const deps = createDeps();
    deps.spies.retrieveVectorStore.mockResolvedValueOnce({
      ...createReadyVectorStore(),
      file_counts: {
        cancelled: 0,
        completed: 0,
        failed: 0,
        in_progress: 0,
        total: 0,
      },
    });
    const activateKnowledgeDataset = createActivateKnowledgeDataset(deps);

    await expect(
      activateKnowledgeDataset({
        activatedByUserId: "user-1",
        datasetVersion: "mvp-2026-03",
      }),
    ).rejects.toMatchObject({
      code: "vector_store_not_ready",
      vectorStoreId: "vs_active_123",
    });
    expect(deps.spies.activateDataset).not.toHaveBeenCalled();
  });

  it("surfaces activation persistence failures as controlled errors", async () => {
    const deps = createDeps();
    deps.spies.activateDataset.mockRejectedValueOnce(
      new Error("rpc failed with internal detail"),
    );
    const activateKnowledgeDataset = createActivateKnowledgeDataset(deps);

    await expect(
      activateKnowledgeDataset({
        activatedByUserId: "user-1",
        datasetVersion: "mvp-2026-03",
      }),
    ).rejects.toMatchObject({
      code: "activation_record_failed",
      name: "ActivateKnowledgeDatasetError",
      vectorStoreId: "vs_active_123",
    });
  });
});
