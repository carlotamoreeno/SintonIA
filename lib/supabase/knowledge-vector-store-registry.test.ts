import { describe, expect, it, vi } from "vitest";
import { createKnowledgeVectorStoreRegistrationStore } from "./knowledge-vector-store-registry";

describe("createKnowledgeVectorStoreRegistrationStore", () => {
  it("loads a registration by dataset version", async () => {
    const returnsMock = vi.fn().mockResolvedValue({
      data: [
        {
          id: "registry-row-1",
          dataset_version: "mvp-2026-03",
          vector_store_id: "vs_123",
          name: "sintonia-mvp-2026-03",
          created_at: "2026-03-31T08:00:00.000Z",
          updated_at: "2026-03-31T08:00:00.000Z",
        },
      ],
      error: null,
    });
    const limitMock = vi.fn().mockReturnValue({
      returns: returnsMock,
    });
    const eqMock = vi.fn().mockReturnValue({
      limit: limitMock,
    });
    const selectMock = vi.fn().mockReturnValue({
      eq: eqMock,
    });
    const fromMock = vi.fn().mockReturnValue({
      select: selectMock,
    });
    const store = createKnowledgeVectorStoreRegistrationStore({
      from: fromMock,
    } as never);

    const result = await store.findByDatasetVersion("mvp-2026-03");

    expect(fromMock).toHaveBeenCalledWith("knowledge_vector_store_registry");
    expect(eqMock).toHaveBeenCalledWith("dataset_version", "mvp-2026-03");
    expect(limitMock).toHaveBeenCalledWith(1);
    expect(result).toEqual({
      id: "registry-row-1",
      datasetVersion: "mvp-2026-03",
      vectorStoreId: "vs_123",
      name: "sintonia-mvp-2026-03",
      createdAt: "2026-03-31T08:00:00.000Z",
      updatedAt: "2026-03-31T08:00:00.000Z",
    });
  });

  it("loads a registration by vector store id", async () => {
    const returnsMock = vi.fn().mockResolvedValue({
      data: [
        {
          id: "registry-row-2",
          dataset_version: "mvp-2026-03",
          vector_store_id: "vs_123",
          name: "sintonia-mvp-2026-03",
          created_at: "2026-03-31T08:00:00.000Z",
          updated_at: "2026-03-31T08:00:00.000Z",
        },
      ],
      error: null,
    });
    const limitMock = vi.fn().mockReturnValue({
      returns: returnsMock,
    });
    const eqMock = vi.fn().mockReturnValue({
      limit: limitMock,
    });
    const selectMock = vi.fn().mockReturnValue({
      eq: eqMock,
    });
    const fromMock = vi.fn().mockReturnValue({
      select: selectMock,
    });
    const store = createKnowledgeVectorStoreRegistrationStore({
      from: fromMock,
    } as never);

    const result = await store.findByVectorStoreId("vs_123");

    expect(eqMock).toHaveBeenCalledWith("vector_store_id", "vs_123");
    expect(result).toEqual({
      id: "registry-row-2",
      datasetVersion: "mvp-2026-03",
      vectorStoreId: "vs_123",
      name: "sintonia-mvp-2026-03",
      createdAt: "2026-03-31T08:00:00.000Z",
      updatedAt: "2026-03-31T08:00:00.000Z",
    });
  });

  it("creates a registration row", async () => {
    const singleMock = vi.fn().mockResolvedValue({
      data: {
        id: "registry-row-3",
        dataset_version: "mvp-2026-03",
        vector_store_id: "vs_123",
        name: "sintonia-mvp-2026-03",
        created_at: "2026-03-31T08:00:00.000Z",
        updated_at: "2026-03-31T08:00:00.000Z",
      },
      error: null,
    });
    const selectMock = vi.fn().mockReturnValue({
      single: singleMock,
    });
    const insertMock = vi.fn().mockReturnValue({
      select: selectMock,
    });
    const fromMock = vi.fn().mockReturnValue({
      insert: insertMock,
    });
    const store = createKnowledgeVectorStoreRegistrationStore({
      from: fromMock,
    } as never);

    const result = await store.createRegistration({
      datasetVersion: "mvp-2026-03",
      vectorStoreId: "vs_123",
      name: "sintonia-mvp-2026-03",
    });

    expect(insertMock).toHaveBeenCalledWith({
      dataset_version: "mvp-2026-03",
      name: "sintonia-mvp-2026-03",
      updated_at: expect.any(String),
      vector_store_id: "vs_123",
    });
    expect(result).toEqual({
      id: "registry-row-3",
      datasetVersion: "mvp-2026-03",
      vectorStoreId: "vs_123",
      name: "sintonia-mvp-2026-03",
      createdAt: "2026-03-31T08:00:00.000Z",
      updatedAt: "2026-03-31T08:00:00.000Z",
    });
  });
});
