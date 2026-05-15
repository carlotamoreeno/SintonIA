import { describe, expect, it, vi } from "vitest";
import { createKnowledgeVectorStoreRegistrationStore } from "./knowledge-vector-store-registry";

describe("createKnowledgeVectorStoreRegistrationStore", () => {
  it("loads a registration by dataset version", async () => {
    const returnsMock = vi.fn().mockResolvedValue({
      data: [
        {
          activated_at: "2026-05-14T09:00:00.000Z",
          activated_by_user_id: "user-1",
          id: "registry-row-1",
          dataset_version: "mvp-2026-03",
          is_active: true,
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
      activatedAt: "2026-05-14T09:00:00.000Z",
      activatedByUserId: "user-1",
      id: "registry-row-1",
      datasetVersion: "mvp-2026-03",
      isActive: true,
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
          activated_at: null,
          activated_by_user_id: null,
          id: "registry-row-2",
          dataset_version: "mvp-2026-03",
          is_active: false,
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
      activatedAt: null,
      activatedByUserId: null,
      id: "registry-row-2",
      datasetVersion: "mvp-2026-03",
      isActive: false,
      vectorStoreId: "vs_123",
      name: "sintonia-mvp-2026-03",
      createdAt: "2026-03-31T08:00:00.000Z",
      updatedAt: "2026-03-31T08:00:00.000Z",
    });
  });

  it("creates a registration row", async () => {
    const singleMock = vi.fn().mockResolvedValue({
      data: {
        activated_at: null,
        activated_by_user_id: null,
        id: "registry-row-3",
        dataset_version: "mvp-2026-03",
        is_active: false,
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
      activatedAt: null,
      activatedByUserId: null,
      id: "registry-row-3",
      datasetVersion: "mvp-2026-03",
      isActive: false,
      vectorStoreId: "vs_123",
      name: "sintonia-mvp-2026-03",
      createdAt: "2026-03-31T08:00:00.000Z",
      updatedAt: "2026-03-31T08:00:00.000Z",
    });
  });

  it("loads the active registration", async () => {
    const returnsMock = vi.fn().mockResolvedValue({
      data: [
        {
          activated_at: "2026-05-14T09:00:00.000Z",
          activated_by_user_id: "user-1",
          id: "registry-row-1",
          dataset_version: "mvp-2026-03",
          is_active: true,
          vector_store_id: "vs_123",
          name: "sintonia-mvp-2026-03",
          created_at: "2026-03-31T08:00:00.000Z",
          updated_at: "2026-05-14T09:00:00.000Z",
        },
      ],
      error: null,
    });
    const limitMock = vi.fn().mockReturnValue({
      returns: returnsMock,
    });
    const orderMock = vi.fn().mockReturnValue({
      limit: limitMock,
    });
    const eqMock = vi.fn().mockReturnValue({
      order: orderMock,
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

    const result = await store.findActiveRegistration();

    expect(eqMock).toHaveBeenCalledWith("is_active", true);
    expect(orderMock).toHaveBeenCalledWith("activated_at", {
      ascending: false,
      nullsFirst: false,
    });
    expect(limitMock).toHaveBeenCalledWith(1);
    expect(result).toMatchObject({
      datasetVersion: "mvp-2026-03",
      isActive: true,
      vectorStoreId: "vs_123",
    });
  });

  it("activates a dataset through the transactional RPC", async () => {
    const singleMock = vi.fn().mockResolvedValue({
      data: {
        activated_at: "2026-05-14T09:00:00.000Z",
        active_dataset_version: "mvp-2026-03",
        active_vector_store_id: "vs_123",
        changed: true,
        previous_dataset_version: "legacy-2026-02",
        previous_vector_store_id: "vs_legacy",
      },
      error: null,
    });
    const rpcMock = vi.fn().mockReturnValue({
      single: singleMock,
    });
    const store = createKnowledgeVectorStoreRegistrationStore({
      rpc: rpcMock,
    } as never);

    const result = await store.activateDataset({
      activatedByUserId: "user-1",
      datasetVersion: "mvp-2026-03",
    });

    expect(rpcMock).toHaveBeenCalledWith("activate_knowledge_dataset", {
      p_activated_by_user_id: "user-1",
      p_dataset_version: "mvp-2026-03",
    });
    expect(result).toEqual({
      activatedAt: "2026-05-14T09:00:00.000Z",
      activeDatasetVersion: "mvp-2026-03",
      activeVectorStoreId: "vs_123",
      changed: true,
      previousDatasetVersion: "legacy-2026-02",
      previousVectorStoreId: "vs_legacy",
    });
  });

  it("lists registrations with active datasets first", async () => {
    const returnsMock = vi.fn().mockResolvedValue({
      data: [],
      error: null,
    });
    const datasetOrderMock = vi.fn().mockReturnValue({
      returns: returnsMock,
    });
    const activeOrderMock = vi.fn().mockReturnValue({
      order: datasetOrderMock,
    });
    const selectMock = vi.fn().mockReturnValue({
      order: activeOrderMock,
    });
    const fromMock = vi.fn().mockReturnValue({
      select: selectMock,
    });
    const store = createKnowledgeVectorStoreRegistrationStore({
      from: fromMock,
    } as never);

    await expect(store.listRegistrations()).resolves.toEqual([]);

    expect(activeOrderMock).toHaveBeenCalledWith("is_active", {
      ascending: false,
    });
    expect(datasetOrderMock).toHaveBeenCalledWith("dataset_version", {
      ascending: true,
    });
  });
});
