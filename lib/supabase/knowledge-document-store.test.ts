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
});
