import { describe, expect, it, vi } from "vitest";
import {
  ActiveKnowledgeDatasetError,
  createActiveKnowledgeDatasetResolver,
} from "./active-dataset-core";

function createRegistration(
  overrides: Partial<{
    activatedAt: string | null;
    datasetVersion: string;
    isActive: boolean;
    vectorStoreId: string;
  }> = {},
) {
  return {
    activatedAt: Object.hasOwn(overrides, "activatedAt")
      ? (overrides.activatedAt ?? null)
      : "2026-05-14T09:00:00.000Z",
    activatedByUserId: "user-1",
    createdAt: "2026-03-31T08:00:00.000Z",
    datasetVersion: overrides.datasetVersion ?? "mvp-2026-03",
    id: "registry-row-1",
    isActive: overrides.isActive ?? true,
    name: "sintonia-mvp-2026-03",
    updatedAt: "2026-05-14T09:00:00.000Z",
    vectorStoreId: overrides.vectorStoreId ?? "vs_active_123",
  };
}

describe("createActiveKnowledgeDatasetResolver", () => {
  it("uses the persisted active registry row first", async () => {
    const findActiveRegistration = vi
      .fn()
      .mockResolvedValue(createRegistration());
    const findByDatasetVersion = vi.fn();
    const resolver = createActiveKnowledgeDatasetResolver({
      fallbackDatasetVersion: "fallback-2026-03",
      registryStore: {
        findActiveRegistration,
        findByDatasetVersion,
      },
    });

    await expect(resolver.resolveActiveDataset()).resolves.toEqual({
      activatedAt: "2026-05-14T09:00:00.000Z",
      datasetVersion: "mvp-2026-03",
      source: "active_registry",
      vectorStoreId: "vs_active_123",
    });
    expect(findByDatasetVersion).not.toHaveBeenCalled();
  });

  it("falls back to ACTIVE_DATASET_VERSION when no row is active", async () => {
    const findActiveRegistration = vi.fn().mockResolvedValue(null);
    const findByDatasetVersion = vi.fn().mockResolvedValue(
      createRegistration({
        activatedAt: null,
        datasetVersion: "fallback-2026-03",
        isActive: false,
        vectorStoreId: "vs_fallback_123",
      }),
    );
    const resolver = createActiveKnowledgeDatasetResolver({
      fallbackDatasetVersion: "fallback-2026-03",
      registryStore: {
        findActiveRegistration,
        findByDatasetVersion,
      },
    });

    await expect(resolver.resolveActiveDataset()).resolves.toEqual({
      activatedAt: null,
      datasetVersion: "fallback-2026-03",
      source: "env_fallback",
      vectorStoreId: "vs_fallback_123",
    });
    expect(findByDatasetVersion).toHaveBeenCalledWith("fallback-2026-03");
  });

  it("fails when neither persisted active state nor fallback config exists", async () => {
    const resolver = createActiveKnowledgeDatasetResolver({
      fallbackDatasetVersion: null,
      registryStore: {
        findActiveRegistration: vi.fn().mockResolvedValue(null),
        findByDatasetVersion: vi.fn(),
      },
    });

    await expect(resolver.resolveActiveDataset()).rejects.toBeInstanceOf(
      ActiveKnowledgeDatasetError,
    );
    await expect(resolver.resolveActiveDataset()).rejects.toMatchObject({
      code: "active_dataset_not_configured",
    });
  });

  it("fails when the fallback dataset has no registry row", async () => {
    const resolver = createActiveKnowledgeDatasetResolver({
      fallbackDatasetVersion: "missing-2026-03",
      registryStore: {
        findActiveRegistration: vi.fn().mockResolvedValue(null),
        findByDatasetVersion: vi.fn().mockResolvedValue(null),
      },
    });

    await expect(resolver.resolveActiveDataset()).rejects.toMatchObject({
      code: "fallback_dataset_not_registered",
      datasetVersion: "missing-2026-03",
    });
  });
});
