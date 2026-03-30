import { describe, expect, it, vi } from "vitest";
import { createKnowledgeDocumentCatalogStore } from "./knowledge-document-store";

describe("createKnowledgeDocumentCatalogStore", () => {
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
});
