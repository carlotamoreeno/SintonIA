import { describe, expect, it, vi } from "vitest";
import { ReindexKnowledgeDocumentError } from "./reindex-knowledge-document-core";
import {
  MAX_MANUAL_DATASET_REINDEX_DOCUMENTS,
  ReindexKnowledgeDatasetError,
  createReindexKnowledgeDataset,
} from "./reindex-knowledge-dataset-core";

function createCatalogDocument(overrides?: Record<string, unknown>) {
  return {
    id: "doc-row-1",
    docId: "botanica-mvp-v1-corpus-mvp",
    title: "Corpus botánico de prueba",
    originalFilename: "botanica-mvp-v1-corpus-mvp.pdf",
    documentVersion: 1,
    status: "ready" as const,
    canonicalPath:
      "datasets/mvp-2026-03/botanica-mvp-v1-corpus-mvp/v1/hash--botanica-mvp-v1-corpus-mvp.pdf",
    mimeType: "application/pdf",
    sha256: "a".repeat(64),
    datasetVersion: "mvp-2026-03",
    openAIFileId: "file_uploaded_123",
    vectorStoreId: "vs_123",
    customMetadata: {},
    lastIndexedAt: "2026-03-31T09:10:00.000Z",
    lastError: null,
    createdAt: "2026-03-30T15:37:24.868Z",
    updatedAt: "2026-03-30T15:37:24.868Z",
    ...overrides,
  };
}

function createRegistration(overrides?: Record<string, unknown>) {
  return {
    id: "registry-row-1",
    datasetVersion: "mvp-2026-03",
    vectorStoreId: "vs_123",
    name: "sintonia-mvp-2026-03",
    createdAt: "2026-03-31T08:00:00.000Z",
    updatedAt: "2026-03-31T08:00:00.000Z",
    ...overrides,
  };
}

function createReindexResult(overrides?: Record<string, unknown>) {
  return {
    document: {
      canonicalPath:
        "datasets/mvp-2026-03/botanica-mvp-v1-corpus-mvp/v1/hash--botanica-mvp-v1-corpus-mvp.pdf",
      datasetVersion: "mvp-2026-03",
      docId: "botanica-mvp-v1-corpus-mvp",
      documentVersion: 1,
      openAIFileId: "file_uploaded_123",
      status: "ready" as const,
    },
    reindex: {
      previousAttachmentDeleted: true,
      previousAttachmentMissing: false,
      previousVectorStoreId: "vs_123",
      resetStatus: "uploaded" as const,
    },
    vectorStore: {
      attributes: {
        dataset_version: "mvp-2026-03",
        doc_id: "botanica-mvp-v1-corpus-mvp",
        document_version: 1,
        mime_type: "application/pdf",
        title: "Corpus botánico de prueba",
      },
      chunkingStrategy: {
        type: "auto" as const,
      },
      fileId: "file_uploaded_123",
      id: "vs_123",
      lastIndexedAt: "2026-03-31T09:20:00.000Z",
      name: "sintonia-mvp-2026-03",
      requestId: "req_attach_123",
      status: "completed" as const,
    },
    ...overrides,
  };
}

function createDeps() {
  const findDocumentsByDatasetVersion = vi
    .fn()
    .mockResolvedValue([createCatalogDocument()]);
  const findByDatasetVersion = vi.fn().mockResolvedValue(createRegistration());
  const reindexKnowledgeDocument = vi
    .fn()
    .mockResolvedValue(createReindexResult());

  return {
    catalogStore: {
      findDocumentsByDatasetVersion,
    },
    registryStore: {
      findByDatasetVersion,
    },
    reindexKnowledgeDocument,
    spies: {
      findByDatasetVersion,
      findDocumentsByDatasetVersion,
      reindexKnowledgeDocument,
    },
  };
}

describe("createReindexKnowledgeDataset", () => {
  it("reindexes eligible documents sequentially with the default limit", async () => {
    const deps = createDeps();
    deps.spies.findDocumentsByDatasetVersion.mockResolvedValue([
      createCatalogDocument({
        docId: "doc-a",
        openAIFileId: "file_a",
      }),
      createCatalogDocument({
        docId: "doc-b",
        documentVersion: 2,
        openAIFileId: "file_b",
      }),
    ]);
    deps.spies.reindexKnowledgeDocument
      .mockResolvedValueOnce(
        createReindexResult({
          document: {
            canonicalPath: "datasets/mvp-2026-03/doc-a/v1/hash--doc-a.pdf",
            datasetVersion: "mvp-2026-03",
            docId: "doc-a",
            documentVersion: 1,
            openAIFileId: "file_a",
            status: "ready",
          },
          vectorStore: {
            ...createReindexResult().vectorStore,
            fileId: "file_a",
          },
        }),
      )
      .mockResolvedValueOnce(
        createReindexResult({
          document: {
            canonicalPath: "datasets/mvp-2026-03/doc-b/v2/hash--doc-b.pdf",
            datasetVersion: "mvp-2026-03",
            docId: "doc-b",
            documentVersion: 2,
            openAIFileId: "file_b",
            status: "ready",
          },
          vectorStore: {
            ...createReindexResult().vectorStore,
            fileId: "file_b",
          },
        }),
      );
    const reindexKnowledgeDataset = createReindexKnowledgeDataset(deps);

    const result = await reindexKnowledgeDataset({
      datasetVersion: "mvp-2026-03",
    });

    expect(deps.spies.findByDatasetVersion).toHaveBeenCalledWith("mvp-2026-03");
    expect(deps.spies.findDocumentsByDatasetVersion).toHaveBeenCalledWith({
      datasetVersion: "mvp-2026-03",
      limit: MAX_MANUAL_DATASET_REINDEX_DOCUMENTS,
    });
    expect(deps.spies.reindexKnowledgeDocument.mock.calls).toEqual([
      [
        {
          datasetVersion: "mvp-2026-03",
          docId: "doc-a",
          documentVersion: 1,
        },
      ],
      [
        {
          datasetVersion: "mvp-2026-03",
          docId: "doc-b",
          documentVersion: 2,
        },
      ],
    ]);
    expect(result.successCount).toBe(2);
    expect(result.failureCount).toBe(0);
    expect(result.skippedCount).toBe(0);
    expect(result.processedCount).toBe(2);
    expect(result.results.map((entry) => entry.status)).toEqual([
      "success",
      "success",
    ]);
  });

  it("continues after failures and reports skipped rows", async () => {
    const deps = createDeps();
    deps.spies.findDocumentsByDatasetVersion.mockResolvedValue([
      createCatalogDocument({
        docId: "doc-success-1",
        openAIFileId: "file_success_1",
      }),
      createCatalogDocument({
        docId: "doc-failed",
        documentVersion: 2,
        openAIFileId: "file_failed",
      }),
      createCatalogDocument({
        docId: "doc-success-2",
        documentVersion: 3,
        openAIFileId: "file_success_2",
      }),
      createCatalogDocument({
        docId: "doc-retired",
        documentVersion: 4,
        openAIFileId: "file_retired",
        status: "retired",
      }),
      createCatalogDocument({
        docId: "doc-pending",
        documentVersion: 5,
        openAIFileId: null,
        status: "pending",
      }),
    ]);
    deps.spies.reindexKnowledgeDocument
      .mockResolvedValueOnce(createReindexResult())
      .mockRejectedValueOnce(
        new ReindexKnowledgeDocumentError({
          code: "reindex_attach_failed",
          message: "attach failed",
          openAIFileId: "file_failed",
          vectorStoreId: "vs_123",
        }),
      )
      .mockResolvedValueOnce(
        createReindexResult({
          document: {
            canonicalPath:
              "datasets/mvp-2026-03/doc-success-2/v3/hash--doc-success-2.pdf",
            datasetVersion: "mvp-2026-03",
            docId: "doc-success-2",
            documentVersion: 3,
            openAIFileId: "file_success_2",
            status: "ready",
          },
          vectorStore: {
            ...createReindexResult().vectorStore,
            fileId: "file_success_2",
          },
        }),
      );
    const reindexKnowledgeDataset = createReindexKnowledgeDataset(deps);

    const result = await reindexKnowledgeDataset({
      datasetVersion: "mvp-2026-03",
      limit: 5,
    });

    expect(deps.spies.reindexKnowledgeDocument.mock.calls).toEqual([
      [
        {
          datasetVersion: "mvp-2026-03",
          docId: "doc-success-1",
          documentVersion: 1,
        },
      ],
      [
        {
          datasetVersion: "mvp-2026-03",
          docId: "doc-failed",
          documentVersion: 2,
        },
      ],
      [
        {
          datasetVersion: "mvp-2026-03",
          docId: "doc-success-2",
          documentVersion: 3,
        },
      ],
    ]);
    expect(result.successCount).toBe(2);
    expect(result.failureCount).toBe(1);
    expect(result.skippedCount).toBe(2);
    expect(result.processedCount).toBe(5);
    expect(result.results.map((entry) => entry.status)).toEqual([
      "success",
      "failed",
      "success",
      "skipped",
      "skipped",
    ]);
    expect(result.results[1]).toMatchObject({
      error: {
        code: "reindex_attach_failed",
        message: "attach failed",
      },
      status: "failed",
    });
    expect(result.results[3]).toMatchObject({
      skip: {
        code: "document_retired",
      },
      status: "skipped",
    });
    expect(result.results[4]).toMatchObject({
      skip: {
        code: "document_not_uploaded",
      },
      status: "skipped",
    });
  });

  it("rejects datasets without a registered vector store", async () => {
    const deps = createDeps();
    deps.spies.findByDatasetVersion.mockResolvedValue(null);
    const reindexKnowledgeDataset = createReindexKnowledgeDataset(deps);

    await expect(
      reindexKnowledgeDataset({
        datasetVersion: "mvp-2026-03",
      }),
    ).rejects.toMatchObject({
      code: "vector_store_not_registered",
    } satisfies Partial<ReindexKnowledgeDatasetError>);
    expect(deps.spies.findDocumentsByDatasetVersion).not.toHaveBeenCalled();
  });

  it("returns an empty summary when the dataset has no documents", async () => {
    const deps = createDeps();
    deps.spies.findDocumentsByDatasetVersion.mockResolvedValue([]);
    const reindexKnowledgeDataset = createReindexKnowledgeDataset(deps);

    await expect(
      reindexKnowledgeDataset({
        datasetVersion: "mvp-2026-03",
        limit: 10,
      }),
    ).resolves.toEqual({
      datasetVersion: "mvp-2026-03",
      failureCount: 0,
      limit: 10,
      processedCount: 0,
      results: [],
      skippedCount: 0,
      successCount: 0,
      vectorStoreId: "vs_123",
    });
  });

  it("rejects limits above the manual maximum", async () => {
    const deps = createDeps();
    const reindexKnowledgeDataset = createReindexKnowledgeDataset(deps);

    await expect(
      reindexKnowledgeDataset({
        datasetVersion: "mvp-2026-03",
        limit: MAX_MANUAL_DATASET_REINDEX_DOCUMENTS + 1,
      }),
    ).rejects.toThrow();
    expect(deps.spies.findByDatasetVersion).not.toHaveBeenCalled();
  });

  it("wraps catalog lookup failures in a dataset-level error", async () => {
    const deps = createDeps();
    deps.spies.findDocumentsByDatasetVersion.mockRejectedValue(
      new Error("catalog-boom"),
    );
    const reindexKnowledgeDataset = createReindexKnowledgeDataset(deps);

    await expect(
      reindexKnowledgeDataset({
        datasetVersion: "mvp-2026-03",
      }),
    ).rejects.toMatchObject({
      code: "catalog_documents_lookup_failed",
      message: "catalog-boom",
      vectorStoreId: "vs_123",
    } satisfies Partial<ReindexKnowledgeDatasetError>);
  });
});
