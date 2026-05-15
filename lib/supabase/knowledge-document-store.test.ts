import { describe, expect, it, vi } from "vitest";
import { createKnowledgeDocumentCatalogStore } from "./knowledge-document-store";

describe("createKnowledgeDocumentCatalogStore", () => {
  it("creates a pending catalog document with canonical metadata", async () => {
    const singleMock = vi.fn().mockResolvedValue({
      data: {
        id: "doc-row-pending",
        doc_id: "orchid-care",
        title: "Guia de orquideas",
        original_filename: "orchid-guide.pdf",
        document_version: 2,
        status: "pending",
        canonical_path:
          "datasets/mvp-2026-03/orchid-care/v2/hash--orchid-guide.pdf",
        mime_type: "application/pdf",
        sha256: "a".repeat(64),
        dataset_version: "mvp-2026-03",
        openai_file_id: null,
        vector_store_id: null,
        custom_metadata_json: {},
        last_indexed_at: null,
        last_error: null,
        created_at: "2026-03-30T15:37:24.868Z",
        updated_at: "2026-03-30T15:55:00.000Z",
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
    const store = createKnowledgeDocumentCatalogStore({
      from: fromMock,
    } as never);

    const result = await store.createPendingDocument({
      canonicalPath:
        "datasets/mvp-2026-03/orchid-care/v2/hash--orchid-guide.pdf",
      datasetVersion: "mvp-2026-03",
      docId: "orchid-care",
      documentVersion: 2,
      mimeType: "application/pdf",
      originalFilename: "orchid-guide.pdf",
      sha256: "a".repeat(64),
      title: "Guia de orquideas",
    });

    expect(fromMock).toHaveBeenCalledWith("knowledge_documents");
    expect(insertMock).toHaveBeenCalledWith({
      canonical_path:
        "datasets/mvp-2026-03/orchid-care/v2/hash--orchid-guide.pdf",
      custom_metadata_json: {},
      dataset_version: "mvp-2026-03",
      doc_id: "orchid-care",
      document_version: 2,
      last_error: null,
      last_indexed_at: null,
      mime_type: "application/pdf",
      openai_file_id: null,
      original_filename: "orchid-guide.pdf",
      sha256: "a".repeat(64),
      status: "pending",
      title: "Guia de orquideas",
      updated_at: expect.any(String),
      vector_store_id: null,
    });
    expect(selectMock).toHaveBeenCalledWith(
      "id, doc_id, title, original_filename, document_version, status, canonical_path, mime_type, sha256, dataset_version, openai_file_id, vector_store_id, custom_metadata_json, last_indexed_at, last_error, created_at, updated_at",
    );
    expect(result).toMatchObject({
      canonicalPath:
        "datasets/mvp-2026-03/orchid-care/v2/hash--orchid-guide.pdf",
      datasetVersion: "mvp-2026-03",
      docId: "orchid-care",
      documentVersion: 2,
      lastError: null,
      lastIndexedAt: null,
      openAIFileId: null,
      status: "pending",
      vectorStoreId: null,
    });
  });

  it("throws with the catalog cause when creating a pending document fails", async () => {
    const store = createKnowledgeDocumentCatalogStore({
      from: vi.fn().mockReturnValue({
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: null,
              error: {
                code: "23505",
                message: "duplicate key value violates unique constraint",
              },
            }),
          }),
        }),
      }),
    } as never);

    await expect(
      store.createPendingDocument({
        canonicalPath:
          "datasets/mvp-2026-03/orchid-care/v2/hash--orchid-guide.pdf",
        datasetVersion: "mvp-2026-03",
        docId: "orchid-care",
        documentVersion: 2,
        mimeType: "application/pdf",
        originalFilename: "orchid-guide.pdf",
        sha256: "a".repeat(64),
        title: "Guia de orquideas",
      }),
    ).rejects.toThrow(
      "Failed to create pending knowledge document: duplicate key value violates unique constraint",
    );
  });

  it("queries the catalog globally by sha256 and returns the first duplicate", async () => {
    const returnsMock = vi.fn().mockResolvedValue({
      data: [
        {
          id: "doc-row-1",
          doc_id: "orchid-care",
          title: "Guia de orquideas",
          document_version: 2,
          dataset_version: "mvp-2026-03",
          canonical_path:
            "datasets/mvp-2026-03/orchid-care/v2/abcd--orchid-guide.pdf",
          sha256: "a".repeat(64),
          status: "ready",
          created_at: "2026-03-30T10:00:00.000Z",
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
    const store = createKnowledgeDocumentCatalogStore({
      from: fromMock,
    } as never);

    const result = await store.findFirstDocumentBySha256("a".repeat(64));

    expect(fromMock).toHaveBeenCalledWith("knowledge_documents");
    expect(selectMock).toHaveBeenCalledWith(
      "id, doc_id, title, document_version, dataset_version, canonical_path, sha256, status, created_at",
    );
    expect(eqMock).toHaveBeenCalledWith("sha256", "a".repeat(64));
    expect(orderMock).toHaveBeenCalledWith("created_at", {
      ascending: true,
    });
    expect(limitMock).toHaveBeenCalledWith(1);
    expect(result).toEqual({
      id: "doc-row-1",
      docId: "orchid-care",
      title: "Guia de orquideas",
      documentVersion: 2,
      datasetVersion: "mvp-2026-03",
      canonicalPath:
        "datasets/mvp-2026-03/orchid-care/v2/abcd--orchid-guide.pdf",
      sha256: "a".repeat(64),
      status: "ready",
      createdAt: "2026-03-30T10:00:00.000Z",
    });
  });

  it("returns null when the catalog contains no duplicate for the requested sha256", async () => {
    const returnsMock = vi.fn().mockResolvedValue({
      data: [],
      error: null,
    });
    const store = createKnowledgeDocumentCatalogStore({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                returns: returnsMock,
              }),
            }),
          }),
        }),
      }),
    } as never);

    await expect(store.findFirstDocumentBySha256("b".repeat(64))).resolves.toBe(
      null,
    );
  });

  it("throws when the catalog query fails", async () => {
    const store = createKnowledgeDocumentCatalogStore({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                returns: vi.fn().mockResolvedValue({
                  data: null,
                  error: {
                    message: "boom",
                  },
                }),
              }),
            }),
          }),
        }),
      }),
    } as never);

    await expect(
      store.findFirstDocumentBySha256("c".repeat(64)),
    ).rejects.toThrow("Failed to load knowledge document duplicates: boom");
  });

  it("loads a document by dataset/doc/version identity", async () => {
    const returnsMock = vi.fn().mockResolvedValue({
      data: [
        {
          id: "doc-row-2",
          doc_id: "botanica-mvp-v1-corpus-mvp",
          title: "Corpus MVP botánico · botanica-mvp-v1",
          original_filename: "botanica-mvp-v1-corpus-mvp.pdf",
          document_version: 1,
          status: "ready",
          canonical_path:
            "datasets/mvp-2026-03/botanica-mvp-v1-corpus-mvp/v1/hash--botanica-mvp-v1-corpus-mvp.pdf",
          mime_type: "application/pdf",
          sha256: "d".repeat(64),
          dataset_version: "mvp-2026-03",
          openai_file_id: "file_123",
          vector_store_id: "vs_123",
          custom_metadata_json: {},
          last_indexed_at: "2026-03-30T15:53:00.240Z",
          last_error: null,
          created_at: "2026-03-30T15:37:24.868Z",
          updated_at: "2026-03-30T15:37:24.868Z",
        },
      ],
      error: null,
    });
    const limitMock = vi.fn().mockReturnValue({
      returns: returnsMock,
    });
    const documentVersionEqMock = vi.fn().mockReturnValue({
      limit: limitMock,
    });
    const docIdEqMock = vi.fn().mockReturnValue({
      eq: documentVersionEqMock,
    });
    const datasetEqMock = vi.fn().mockReturnValue({
      eq: docIdEqMock,
    });
    const selectMock = vi.fn().mockReturnValue({
      eq: datasetEqMock,
    });
    const fromMock = vi.fn().mockReturnValue({
      select: selectMock,
    });
    const store = createKnowledgeDocumentCatalogStore({
      from: fromMock,
    } as never);

    const result = await store.findDocumentByIdentity({
      datasetVersion: "mvp-2026-03",
      docId: "botanica-mvp-v1-corpus-mvp",
      documentVersion: 1,
    });

    expect(fromMock).toHaveBeenCalledWith("knowledge_documents");
    expect(datasetEqMock).toHaveBeenCalledWith(
      "dataset_version",
      "mvp-2026-03",
    );
    expect(docIdEqMock).toHaveBeenCalledWith(
      "doc_id",
      "botanica-mvp-v1-corpus-mvp",
    );
    expect(documentVersionEqMock).toHaveBeenCalledWith("document_version", 1);
    expect(limitMock).toHaveBeenCalledWith(1);
    expect(result).toEqual({
      id: "doc-row-2",
      docId: "botanica-mvp-v1-corpus-mvp",
      title: "Corpus MVP botánico · botanica-mvp-v1",
      originalFilename: "botanica-mvp-v1-corpus-mvp.pdf",
      documentVersion: 1,
      status: "ready",
      canonicalPath:
        "datasets/mvp-2026-03/botanica-mvp-v1-corpus-mvp/v1/hash--botanica-mvp-v1-corpus-mvp.pdf",
      mimeType: "application/pdf",
      sha256: "d".repeat(64),
      datasetVersion: "mvp-2026-03",
      openAIFileId: "file_123",
      vectorStoreId: "vs_123",
      customMetadata: {},
      lastIndexedAt: "2026-03-30T15:53:00.240Z",
      lastError: null,
      createdAt: "2026-03-30T15:37:24.868Z",
      updatedAt: "2026-03-30T15:37:24.868Z",
    });
  });

  it("throws when loading a document by identity fails", async () => {
    const store = createKnowledgeDocumentCatalogStore({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                limit: vi.fn().mockReturnValue({
                  returns: vi.fn().mockResolvedValue({
                    data: null,
                    error: {
                      message: "identity-boom",
                    },
                  }),
                }),
              }),
            }),
          }),
        }),
      }),
    } as never);

    await expect(
      store.findDocumentByIdentity({
        datasetVersion: "mvp-2026-03",
        docId: "botanica-mvp-v1-corpus-mvp",
        documentVersion: 1,
      }),
    ).rejects.toThrow(
      "Failed to load knowledge document by identity: identity-boom",
    );
  });

  it("lists documents by dataset version with a stable order and limit", async () => {
    const returnsMock = vi.fn().mockResolvedValue({
      data: [
        {
          id: "doc-row-3",
          doc_id: "orchid-care",
          title: "Guia de orquideas",
          original_filename: "orchid-guide.pdf",
          document_version: 1,
          status: "ready",
          canonical_path:
            "datasets/mvp-2026-03/orchid-care/v1/hash--orchid-guide.pdf",
          mime_type: "application/pdf",
          sha256: "e".repeat(64),
          dataset_version: "mvp-2026-03",
          openai_file_id: "file_456",
          vector_store_id: "vs_123",
          custom_metadata_json: {},
          last_indexed_at: "2026-03-31T10:00:00.000Z",
          last_error: null,
          created_at: "2026-03-30T10:00:00.000Z",
          updated_at: "2026-03-31T10:00:00.000Z",
        },
      ],
      error: null,
    });
    const limitMock = vi.fn().mockReturnValue({
      returns: returnsMock,
    });
    const documentVersionOrderMock = vi.fn().mockReturnValue({
      limit: limitMock,
    });
    const docIdOrderMock = vi.fn().mockReturnValue({
      order: documentVersionOrderMock,
    });
    const createdAtOrderMock = vi.fn().mockReturnValue({
      order: docIdOrderMock,
    });
    const datasetEqMock = vi.fn().mockReturnValue({
      order: createdAtOrderMock,
    });
    const selectMock = vi.fn().mockReturnValue({
      eq: datasetEqMock,
    });
    const fromMock = vi.fn().mockReturnValue({
      select: selectMock,
    });
    const store = createKnowledgeDocumentCatalogStore({
      from: fromMock,
    } as never);

    const result = await store.findDocumentsByDatasetVersion({
      datasetVersion: "mvp-2026-03",
      limit: 25,
    });

    expect(fromMock).toHaveBeenCalledWith("knowledge_documents");
    expect(datasetEqMock).toHaveBeenCalledWith(
      "dataset_version",
      "mvp-2026-03",
    );
    expect(createdAtOrderMock).toHaveBeenCalledWith("created_at", {
      ascending: true,
    });
    expect(docIdOrderMock).toHaveBeenCalledWith("doc_id", {
      ascending: true,
    });
    expect(documentVersionOrderMock).toHaveBeenCalledWith("document_version", {
      ascending: true,
    });
    expect(limitMock).toHaveBeenCalledWith(25);
    expect(result).toEqual([
      {
        id: "doc-row-3",
        docId: "orchid-care",
        title: "Guia de orquideas",
        originalFilename: "orchid-guide.pdf",
        documentVersion: 1,
        status: "ready",
        canonicalPath:
          "datasets/mvp-2026-03/orchid-care/v1/hash--orchid-guide.pdf",
        mimeType: "application/pdf",
        sha256: "e".repeat(64),
        datasetVersion: "mvp-2026-03",
        openAIFileId: "file_456",
        vectorStoreId: "vs_123",
        customMetadata: {},
        lastIndexedAt: "2026-03-31T10:00:00.000Z",
        lastError: null,
        createdAt: "2026-03-30T10:00:00.000Z",
        updatedAt: "2026-03-31T10:00:00.000Z",
      },
    ]);
  });

  it("throws when listing documents by dataset version fails", async () => {
    const store = createKnowledgeDocumentCatalogStore({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                order: vi.fn().mockReturnValue({
                  limit: vi.fn().mockReturnValue({
                    returns: vi.fn().mockResolvedValue({
                      data: null,
                      error: {
                        message: "dataset-boom",
                      },
                    }),
                  }),
                }),
              }),
            }),
          }),
        }),
      }),
    } as never);

    await expect(
      store.findDocumentsByDatasetVersion({
        datasetVersion: "mvp-2026-03",
        limit: 25,
      }),
    ).rejects.toThrow(
      "Failed to load knowledge documents by dataset version: dataset-boom",
    );
  });

  it("lists documents across datasets with a stable admin inventory order", async () => {
    const returnsMock = vi.fn().mockResolvedValue({
      data: [
        {
          id: "doc-row-4",
          doc_id: "botanica-mvp-v1-corpus-mvp",
          title: "Corpus MVP botanico",
          original_filename: "botanica-mvp-v1-corpus-mvp.pdf",
          document_version: 1,
          status: "ready",
          canonical_path:
            "datasets/mvp-2026-03/botanica-mvp-v1-corpus-mvp/v1/hash--botanica-mvp-v1-corpus-mvp.pdf",
          mime_type: "application/pdf",
          sha256: "4".repeat(64),
          dataset_version: "mvp-2026-03",
          openai_file_id: "file_789",
          vector_store_id: "vs_123",
          custom_metadata_json: {},
          last_indexed_at: "2026-04-01T10:00:00.000Z",
          last_error: null,
          created_at: "2026-03-30T10:00:00.000Z",
          updated_at: "2026-04-01T10:00:00.000Z",
        },
      ],
      error: null,
    });
    const limitMock = vi.fn().mockReturnValue({
      returns: returnsMock,
    });
    const documentVersionOrderMock = vi.fn().mockReturnValue({
      limit: limitMock,
    });
    const docIdOrderMock = vi.fn().mockReturnValue({
      order: documentVersionOrderMock,
    });
    const datasetVersionOrderMock = vi.fn().mockReturnValue({
      order: docIdOrderMock,
    });
    const selectMock = vi.fn().mockReturnValue({
      order: datasetVersionOrderMock,
    });
    const fromMock = vi.fn().mockReturnValue({
      select: selectMock,
    });
    const store = createKnowledgeDocumentCatalogStore({
      from: fromMock,
    } as never);

    const result = await store.listDocuments({
      limit: 100,
    });

    expect(fromMock).toHaveBeenCalledWith("knowledge_documents");
    expect(selectMock).toHaveBeenCalledWith(
      "id, doc_id, title, original_filename, document_version, status, canonical_path, mime_type, sha256, dataset_version, openai_file_id, vector_store_id, custom_metadata_json, last_indexed_at, last_error, created_at, updated_at",
    );
    expect(datasetVersionOrderMock).toHaveBeenCalledWith("dataset_version", {
      ascending: true,
    });
    expect(docIdOrderMock).toHaveBeenCalledWith("doc_id", {
      ascending: true,
    });
    expect(documentVersionOrderMock).toHaveBeenCalledWith("document_version", {
      ascending: false,
    });
    expect(limitMock).toHaveBeenCalledWith(100);
    expect(result).toEqual([
      {
        id: "doc-row-4",
        docId: "botanica-mvp-v1-corpus-mvp",
        title: "Corpus MVP botanico",
        originalFilename: "botanica-mvp-v1-corpus-mvp.pdf",
        documentVersion: 1,
        status: "ready",
        canonicalPath:
          "datasets/mvp-2026-03/botanica-mvp-v1-corpus-mvp/v1/hash--botanica-mvp-v1-corpus-mvp.pdf",
        mimeType: "application/pdf",
        sha256: "4".repeat(64),
        datasetVersion: "mvp-2026-03",
        openAIFileId: "file_789",
        vectorStoreId: "vs_123",
        customMetadata: {},
        lastIndexedAt: "2026-04-01T10:00:00.000Z",
        lastError: null,
        createdAt: "2026-03-30T10:00:00.000Z",
        updatedAt: "2026-04-01T10:00:00.000Z",
      },
    ]);
  });

  it("throws when listing the admin inventory fails", async () => {
    const store = createKnowledgeDocumentCatalogStore({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                limit: vi.fn().mockReturnValue({
                  returns: vi.fn().mockResolvedValue({
                    data: null,
                    error: {
                      message: "inventory-boom",
                    },
                  }),
                }),
              }),
            }),
          }),
        }),
      }),
    } as never);

    await expect(
      store.listDocuments({
        limit: 100,
      }),
    ).rejects.toThrow("Failed to list knowledge documents: inventory-boom");
  });

  it("records a pending indexing state and clears all operational fields", async () => {
    const singleMock = vi.fn().mockResolvedValue({
      data: {
        id: "doc-row-pending",
        doc_id: "orchid-care",
        title: "Guia de orquideas",
        original_filename: "orchid-guide.pdf",
        document_version: 2,
        status: "pending",
        canonical_path:
          "datasets/mvp-2026-03/orchid-care/v2/hash--orchid-guide.pdf",
        mime_type: "application/pdf",
        sha256: "0".repeat(64),
        dataset_version: "mvp-2026-03",
        openai_file_id: null,
        vector_store_id: null,
        custom_metadata_json: {},
        last_indexed_at: null,
        last_error: null,
        created_at: "2026-03-30T15:37:24.868Z",
        updated_at: "2026-03-30T15:55:00.000Z",
      },
      error: null,
    });
    const selectMock = vi.fn().mockReturnValue({
      single: singleMock,
    });
    const documentVersionEqMock = vi.fn().mockReturnValue({
      select: selectMock,
    });
    const docIdEqMock = vi.fn().mockReturnValue({
      eq: documentVersionEqMock,
    });
    const datasetEqMock = vi.fn().mockReturnValue({
      eq: docIdEqMock,
    });
    const updateMock = vi.fn().mockReturnValue({
      eq: datasetEqMock,
    });
    const fromMock = vi.fn().mockReturnValue({
      update: updateMock,
    });
    const store = createKnowledgeDocumentCatalogStore({
      from: fromMock,
    } as never);

    const result = await store.recordIndexingState({
      datasetVersion: "mvp-2026-03",
      docId: "orchid-care",
      documentVersion: 2,
      lastError: null,
      lastIndexedAt: null,
      openAIFileId: null,
      status: "pending",
      vectorStoreId: null,
    });

    expect(updateMock).toHaveBeenCalledWith({
      last_error: null,
      last_indexed_at: null,
      openai_file_id: null,
      status: "pending",
      updated_at: expect.any(String),
      vector_store_id: null,
    });
    expect(result).toMatchObject({
      lastError: null,
      lastIndexedAt: null,
      openAIFileId: null,
      status: "pending",
      vectorStoreId: null,
    });
  });

  it("records an uploaded indexing state on the catalog row", async () => {
    const singleMock = vi.fn().mockResolvedValue({
      data: {
        id: "doc-row-3",
        doc_id: "orchid-care",
        title: "Guia de orquideas",
        original_filename: "orchid-guide.pdf",
        document_version: 2,
        status: "uploaded",
        canonical_path:
          "datasets/mvp-2026-03/orchid-care/v2/hash--orchid-guide.pdf",
        mime_type: "application/pdf",
        sha256: "e".repeat(64),
        dataset_version: "mvp-2026-03",
        openai_file_id: "file_uploaded_123",
        vector_store_id: null,
        custom_metadata_json: {},
        last_indexed_at: null,
        last_error: null,
        created_at: "2026-03-30T15:37:24.868Z",
        updated_at: "2026-03-30T16:00:00.000Z",
      },
      error: null,
    });
    const selectMock = vi.fn().mockReturnValue({
      single: singleMock,
    });
    const documentVersionEqMock = vi.fn().mockReturnValue({
      select: selectMock,
    });
    const docIdEqMock = vi.fn().mockReturnValue({
      eq: documentVersionEqMock,
    });
    const datasetEqMock = vi.fn().mockReturnValue({
      eq: docIdEqMock,
    });
    const updateMock = vi.fn().mockReturnValue({
      eq: datasetEqMock,
    });
    const fromMock = vi.fn().mockReturnValue({
      update: updateMock,
    });
    const store = createKnowledgeDocumentCatalogStore({
      from: fromMock,
    } as never);

    const result = await store.recordIndexingState({
      datasetVersion: "mvp-2026-03",
      docId: "orchid-care",
      documentVersion: 2,
      lastError: null,
      lastIndexedAt: null,
      openAIFileId: "file_uploaded_123",
      status: "uploaded",
      vectorStoreId: null,
    });

    expect(fromMock).toHaveBeenCalledWith("knowledge_documents");
    expect(updateMock).toHaveBeenCalledWith({
      last_error: null,
      last_indexed_at: null,
      openai_file_id: "file_uploaded_123",
      status: "uploaded",
      updated_at: expect.any(String),
      vector_store_id: null,
    });
    expect(datasetEqMock).toHaveBeenCalledWith(
      "dataset_version",
      "mvp-2026-03",
    );
    expect(docIdEqMock).toHaveBeenCalledWith("doc_id", "orchid-care");
    expect(documentVersionEqMock).toHaveBeenCalledWith("document_version", 2);
    expect(selectMock).toHaveBeenCalledWith(
      "id, doc_id, title, original_filename, document_version, status, canonical_path, mime_type, sha256, dataset_version, openai_file_id, vector_store_id, custom_metadata_json, last_indexed_at, last_error, created_at, updated_at",
    );
    expect(result).toMatchObject({
      docId: "orchid-care",
      documentVersion: 2,
      lastIndexedAt: null,
      openAIFileId: "file_uploaded_123",
      status: "uploaded",
      vectorStoreId: null,
    });
  });

  it("records a failed indexing state while preserving operational traceability", async () => {
    const store = createKnowledgeDocumentCatalogStore({
      from: vi.fn().mockReturnValue({
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                select: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({
                    data: {
                      id: "doc-row-4",
                      doc_id: "orchid-care",
                      title: "Guia de orquideas",
                      original_filename: "orchid-guide.pdf",
                      document_version: 2,
                      status: "failed",
                      canonical_path:
                        "datasets/mvp-2026-03/orchid-care/v2/hash--orchid-guide.pdf",
                      mime_type: "application/pdf",
                      sha256: "f".repeat(64),
                      dataset_version: "mvp-2026-03",
                      openai_file_id: "file_uploaded_123",
                      vector_store_id: "vs_existing",
                      custom_metadata_json: {},
                      last_indexed_at: "2026-03-31T09:05:00.000Z",
                      last_error: "Storage object not found.",
                      created_at: "2026-03-30T15:37:24.868Z",
                      updated_at: "2026-03-30T16:05:00.000Z",
                    },
                    error: null,
                  }),
                }),
              }),
            }),
          }),
        }),
      }),
    } as never);

    await expect(
      store.recordIndexingState({
        datasetVersion: "mvp-2026-03",
        docId: "orchid-care",
        documentVersion: 2,
        lastError: "Storage object not found.",
        lastIndexedAt: "2026-03-31T09:05:00.000Z",
        openAIFileId: "file_uploaded_123",
        status: "failed",
        vectorStoreId: "vs_existing",
      }),
    ).resolves.toMatchObject({
      lastError: "Storage object not found.",
      lastIndexedAt: "2026-03-31T09:05:00.000Z",
      openAIFileId: "file_uploaded_123",
      status: "failed",
      vectorStoreId: "vs_existing",
    });
  });

  it("throws when recording an indexing state fails", async () => {
    const store = createKnowledgeDocumentCatalogStore({
      from: vi.fn().mockReturnValue({
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                select: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({
                    data: null,
                    error: {
                      message: "update-boom",
                    },
                  }),
                }),
              }),
            }),
          }),
        }),
      }),
    } as never);

    await expect(
      store.recordIndexingState({
        datasetVersion: "mvp-2026-03",
        docId: "orchid-care",
        documentVersion: 2,
        lastError: "boom",
        lastIndexedAt: null,
        openAIFileId: "file_uploaded_123",
        status: "uploaded",
        vectorStoreId: null,
      }),
    ).rejects.toThrow(
      "Failed to record knowledge document indexing state: update-boom",
    );
  });

  it("records an attached indexing state on the catalog row", async () => {
    const singleMock = vi.fn().mockResolvedValue({
      data: {
        id: "doc-row-5",
        doc_id: "orchid-care",
        title: "Guia de orquideas",
        original_filename: "orchid-guide.pdf",
        document_version: 2,
        status: "attached",
        canonical_path:
          "datasets/mvp-2026-03/orchid-care/v2/hash--orchid-guide.pdf",
        mime_type: "application/pdf",
        sha256: "1".repeat(64),
        dataset_version: "mvp-2026-03",
        openai_file_id: "file_uploaded_123",
        vector_store_id: "vs_123",
        custom_metadata_json: {},
        last_indexed_at: null,
        last_error: null,
        created_at: "2026-03-30T15:37:24.868Z",
        updated_at: "2026-03-31T09:00:00.000Z",
      },
      error: null,
    });
    const selectMock = vi.fn().mockReturnValue({
      single: singleMock,
    });
    const documentVersionEqMock = vi.fn().mockReturnValue({
      select: selectMock,
    });
    const docIdEqMock = vi.fn().mockReturnValue({
      eq: documentVersionEqMock,
    });
    const datasetEqMock = vi.fn().mockReturnValue({
      eq: docIdEqMock,
    });
    const updateMock = vi.fn().mockReturnValue({
      eq: datasetEqMock,
    });
    const fromMock = vi.fn().mockReturnValue({
      update: updateMock,
    });
    const store = createKnowledgeDocumentCatalogStore({
      from: fromMock,
    } as never);

    const result = await store.recordIndexingState({
      datasetVersion: "mvp-2026-03",
      docId: "orchid-care",
      documentVersion: 2,
      lastError: null,
      lastIndexedAt: null,
      openAIFileId: "file_uploaded_123",
      status: "attached",
      vectorStoreId: "vs_123",
    });

    expect(updateMock).toHaveBeenCalledWith({
      last_error: null,
      last_indexed_at: null,
      openai_file_id: "file_uploaded_123",
      status: "attached",
      updated_at: expect.any(String),
      vector_store_id: "vs_123",
    });
    expect(result).toMatchObject({
      docId: "orchid-care",
      documentVersion: 2,
      lastError: null,
      lastIndexedAt: null,
      openAIFileId: "file_uploaded_123",
      status: "attached",
      vectorStoreId: "vs_123",
    });
  });

  it("records a ready indexing state on the catalog row", async () => {
    const singleMock = vi.fn().mockResolvedValue({
      data: {
        id: "doc-row-ready",
        doc_id: "orchid-care",
        title: "Guia de orquideas",
        original_filename: "orchid-guide.pdf",
        document_version: 2,
        status: "ready",
        canonical_path:
          "datasets/mvp-2026-03/orchid-care/v2/hash--orchid-guide.pdf",
        mime_type: "application/pdf",
        sha256: "3".repeat(64),
        dataset_version: "mvp-2026-03",
        openai_file_id: "file_uploaded_123",
        vector_store_id: "vs_123",
        custom_metadata_json: {},
        last_indexed_at: "2026-03-31T09:15:00.000Z",
        last_error: null,
        created_at: "2026-03-30T15:37:24.868Z",
        updated_at: "2026-03-31T09:15:00.000Z",
      },
      error: null,
    });
    const selectMock = vi.fn().mockReturnValue({
      single: singleMock,
    });
    const documentVersionEqMock = vi.fn().mockReturnValue({
      select: selectMock,
    });
    const docIdEqMock = vi.fn().mockReturnValue({
      eq: documentVersionEqMock,
    });
    const datasetEqMock = vi.fn().mockReturnValue({
      eq: docIdEqMock,
    });
    const updateMock = vi.fn().mockReturnValue({
      eq: datasetEqMock,
    });
    const fromMock = vi.fn().mockReturnValue({
      update: updateMock,
    });
    const store = createKnowledgeDocumentCatalogStore({
      from: fromMock,
    } as never);

    const result = await store.recordIndexingState({
      datasetVersion: "mvp-2026-03",
      docId: "orchid-care",
      documentVersion: 2,
      lastError: null,
      lastIndexedAt: "2026-03-31T09:15:00.000Z",
      openAIFileId: "file_uploaded_123",
      status: "ready",
      vectorStoreId: "vs_123",
    });

    expect(updateMock).toHaveBeenCalledWith({
      last_error: null,
      last_indexed_at: "2026-03-31T09:15:00.000Z",
      openai_file_id: "file_uploaded_123",
      status: "ready",
      updated_at: expect.any(String),
      vector_store_id: "vs_123",
    });
    expect(result).toMatchObject({
      lastError: null,
      lastIndexedAt: "2026-03-31T09:15:00.000Z",
      openAIFileId: "file_uploaded_123",
      status: "ready",
      vectorStoreId: "vs_123",
    });
  });
});
