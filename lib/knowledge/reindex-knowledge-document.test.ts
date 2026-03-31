import { describe, expect, it, vi } from "vitest";
import { OpenAIAdapterError } from "@/lib/openai/adapter-core";
import { AttachKnowledgeDocumentToVectorStoreError } from "./attach-document-to-vector-store-core";
import { createReindexKnowledgeDocument } from "./reindex-knowledge-document-core";

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

function createAttachResult() {
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
  };
}

function createDeps() {
  const findDocumentByIdentity = vi
    .fn()
    .mockResolvedValue(createCatalogDocument());
  const recordIndexingState = vi.fn().mockResolvedValue(
    createCatalogDocument({
      lastError: null,
      lastIndexedAt: null,
      status: "uploaded",
      vectorStoreId: null,
    }),
  );
  const retrieveVectorStoreFile = vi.fn().mockResolvedValue({
    id: "file_uploaded_123",
    last_error: null,
    object: "vector_store.file",
    status: "completed",
    vector_store_id: "vs_123",
  });
  const deleteVectorStoreFile = vi.fn().mockResolvedValue({
    deleted: true,
    id: "file_uploaded_123",
    object: "vector_store.file.deleted",
  });
  const findByDatasetVersion = vi.fn().mockResolvedValue(createRegistration());
  const attachKnowledgeDocumentToVectorStore = vi
    .fn()
    .mockResolvedValue(createAttachResult());

  return {
    attachKnowledgeDocumentToVectorStore,
    catalogStore: {
      findDocumentByIdentity,
      recordIndexingState,
    },
    openAI: {
      deleteVectorStoreFile,
      retrieveVectorStoreFile,
    },
    registryStore: {
      findByDatasetVersion,
    },
    spies: {
      attachKnowledgeDocumentToVectorStore,
      deleteVectorStoreFile,
      findByDatasetVersion,
      findDocumentByIdentity,
      recordIndexingState,
      retrieveVectorStoreFile,
    },
  };
}

describe("createReindexKnowledgeDocument", () => {
  it("deletes the previous attachment, resets the row to uploaded and reattaches the document", async () => {
    const deps = createDeps();
    const reindexKnowledgeDocument = createReindexKnowledgeDocument(deps);

    const result = await reindexKnowledgeDocument({
      datasetVersion: "mvp-2026-03",
      docId: "botanica-mvp-v1-corpus-mvp",
      documentVersion: 1,
    });

    expect(deps.spies.findByDatasetVersion).toHaveBeenCalledWith("mvp-2026-03");
    expect(deps.spies.retrieveVectorStoreFile).toHaveBeenCalledWith(
      "vs_123",
      "file_uploaded_123",
    );
    expect(deps.spies.deleteVectorStoreFile).toHaveBeenCalledWith(
      "vs_123",
      "file_uploaded_123",
    );
    expect(deps.spies.recordIndexingState).toHaveBeenCalledWith({
      datasetVersion: "mvp-2026-03",
      docId: "botanica-mvp-v1-corpus-mvp",
      documentVersion: 1,
      lastError: null,
      lastIndexedAt: null,
      openAIFileId: "file_uploaded_123",
      status: "uploaded",
      vectorStoreId: null,
    });
    expect(
      deps.spies.attachKnowledgeDocumentToVectorStore,
    ).toHaveBeenCalledWith({
      datasetVersion: "mvp-2026-03",
      docId: "botanica-mvp-v1-corpus-mvp",
      documentVersion: 1,
    });
    expect(result).toEqual({
      document: createAttachResult().document,
      reindex: {
        previousAttachmentDeleted: true,
        previousAttachmentMissing: false,
        previousVectorStoreId: "vs_123",
        resetStatus: "uploaded",
      },
      vectorStore: createAttachResult().vectorStore,
    });
  });

  it("treats a missing previous attachment as non-blocking", async () => {
    const deps = createDeps();
    deps.spies.retrieveVectorStoreFile.mockRejectedValue(
      new OpenAIAdapterError({
        cause: new Error("not-found"),
        message: "Not found.",
        retryable: false,
        status: 404,
      }),
    );
    const reindexKnowledgeDocument = createReindexKnowledgeDocument(deps);

    const result = await reindexKnowledgeDocument({
      datasetVersion: "mvp-2026-03",
      docId: "botanica-mvp-v1-corpus-mvp",
      documentVersion: 1,
    });

    expect(deps.spies.deleteVectorStoreFile).not.toHaveBeenCalled();
    expect(result.reindex).toEqual({
      previousAttachmentDeleted: false,
      previousAttachmentMissing: true,
      previousVectorStoreId: "vs_123",
      resetStatus: "uploaded",
    });
  });

  it("rejects when the catalog row does not exist", async () => {
    const deps = createDeps();
    deps.spies.findDocumentByIdentity.mockResolvedValue(null);
    const reindexKnowledgeDocument = createReindexKnowledgeDocument(deps);

    await expect(
      reindexKnowledgeDocument({
        datasetVersion: "mvp-2026-03",
        docId: "missing-doc",
        documentVersion: 1,
      }),
    ).rejects.toMatchObject({
      code: "document_not_found",
    });
    expect(deps.spies.recordIndexingState).not.toHaveBeenCalled();
  });

  it("rejects retired catalog rows before touching OpenAI", async () => {
    const deps = createDeps();
    deps.spies.findDocumentByIdentity.mockResolvedValue(
      createCatalogDocument({
        status: "retired",
      }),
    );
    const reindexKnowledgeDocument = createReindexKnowledgeDocument(deps);

    await expect(
      reindexKnowledgeDocument({
        datasetVersion: "mvp-2026-03",
        docId: "botanica-mvp-v1-corpus-mvp",
        documentVersion: 1,
      }),
    ).rejects.toMatchObject({
      code: "document_retired",
    });
    expect(deps.spies.retrieveVectorStoreFile).not.toHaveBeenCalled();
  });

  it("rejects documents that do not expose an openai_file_id", async () => {
    const deps = createDeps();
    deps.spies.findDocumentByIdentity.mockResolvedValue(
      createCatalogDocument({
        openAIFileId: null,
      }),
    );
    const reindexKnowledgeDocument = createReindexKnowledgeDocument(deps);

    await expect(
      reindexKnowledgeDocument({
        datasetVersion: "mvp-2026-03",
        docId: "botanica-mvp-v1-corpus-mvp",
        documentVersion: 1,
      }),
    ).rejects.toMatchObject({
      code: "document_not_uploaded",
    });
    expect(deps.spies.retrieveVectorStoreFile).not.toHaveBeenCalled();
  });

  it("rejects when the dataset does not have a registered vector store", async () => {
    const deps = createDeps();
    deps.spies.findByDatasetVersion.mockResolvedValue(null);
    const reindexKnowledgeDocument = createReindexKnowledgeDocument(deps);

    await expect(
      reindexKnowledgeDocument({
        datasetVersion: "mvp-2026-03",
        docId: "botanica-mvp-v1-corpus-mvp",
        documentVersion: 1,
      }),
    ).rejects.toMatchObject({
      code: "vector_store_not_registered",
    });
    expect(deps.spies.retrieveVectorStoreFile).not.toHaveBeenCalled();
  });

  it("records a failed state when the previous attachment cannot be retrieved", async () => {
    const deps = createDeps();
    deps.spies.retrieveVectorStoreFile.mockRejectedValue(
      new OpenAIAdapterError({
        cause: new Error("lookup-boom"),
        message: "lookup-boom",
        retryable: false,
        status: 500,
      }),
    );
    const reindexKnowledgeDocument = createReindexKnowledgeDocument(deps);

    await expect(
      reindexKnowledgeDocument({
        datasetVersion: "mvp-2026-03",
        docId: "botanica-mvp-v1-corpus-mvp",
        documentVersion: 1,
      }),
    ).rejects.toMatchObject({
      code: "openai_vector_store_file_lookup_failed",
      openAIFileId: "file_uploaded_123",
      vectorStoreId: "vs_123",
    });
    expect(deps.spies.recordIndexingState).toHaveBeenCalledWith({
      datasetVersion: "mvp-2026-03",
      docId: "botanica-mvp-v1-corpus-mvp",
      documentVersion: 1,
      lastError: "lookup-boom",
      lastIndexedAt: expect.any(String),
      openAIFileId: "file_uploaded_123",
      status: "failed",
      vectorStoreId: "vs_123",
    });
    expect(
      deps.spies.attachKnowledgeDocumentToVectorStore,
    ).not.toHaveBeenCalled();
  });

  it("records a failed state when deleting the previous attachment fails", async () => {
    const deps = createDeps();
    deps.spies.deleteVectorStoreFile.mockRejectedValue(
      new Error("delete-boom"),
    );
    const reindexKnowledgeDocument = createReindexKnowledgeDocument(deps);

    await expect(
      reindexKnowledgeDocument({
        datasetVersion: "mvp-2026-03",
        docId: "botanica-mvp-v1-corpus-mvp",
        documentVersion: 1,
      }),
    ).rejects.toMatchObject({
      code: "openai_vector_store_file_delete_failed",
      openAIFileId: "file_uploaded_123",
      vectorStoreId: "vs_123",
    });
    expect(deps.spies.recordIndexingState).toHaveBeenCalledWith({
      datasetVersion: "mvp-2026-03",
      docId: "botanica-mvp-v1-corpus-mvp",
      documentVersion: 1,
      lastError: "delete-boom",
      lastIndexedAt: expect.any(String),
      openAIFileId: "file_uploaded_123",
      status: "failed",
      vectorStoreId: "vs_123",
    });
  });

  it("wraps attach failures after resetting the row to uploaded", async () => {
    const deps = createDeps();
    deps.spies.attachKnowledgeDocumentToVectorStore.mockRejectedValue(
      new Error("attach-boom"),
    );
    const reindexKnowledgeDocument = createReindexKnowledgeDocument(deps);

    await expect(
      reindexKnowledgeDocument({
        datasetVersion: "mvp-2026-03",
        docId: "botanica-mvp-v1-corpus-mvp",
        documentVersion: 1,
      }),
    ).rejects.toMatchObject({
      code: "reindex_attach_failed",
      openAIFileId: "file_uploaded_123",
      vectorStoreId: "vs_123",
    });
    expect(deps.spies.recordIndexingState).toHaveBeenCalledTimes(1);
  });

  it("retries the attach once when OpenAI returns a transient server error", async () => {
    vi.useFakeTimers();

    try {
      const deps = createDeps();
      deps.spies.attachKnowledgeDocumentToVectorStore
        .mockRejectedValueOnce(
          new AttachKnowledgeDocumentToVectorStoreError({
            code: "openai_vector_store_file_processing_failed",
            message:
              "Vector store file file_uploaded_123 finished with status failed. server_error: An internal error occurred.",
            openAIFileId: "file_uploaded_123",
            vectorStoreFileId: "file_uploaded_123",
            vectorStoreId: "vs_123",
          }),
        )
        .mockResolvedValueOnce(createAttachResult());
      const reindexKnowledgeDocument = createReindexKnowledgeDocument(deps);

      const resultPromise = reindexKnowledgeDocument({
        datasetVersion: "mvp-2026-03",
        docId: "botanica-mvp-v1-corpus-mvp",
        documentVersion: 1,
      });

      await vi.advanceTimersByTimeAsync(1_000);
      const result = await resultPromise;

      expect(
        deps.spies.attachKnowledgeDocumentToVectorStore,
      ).toHaveBeenCalledTimes(2);
      expect(deps.spies.recordIndexingState).toHaveBeenCalledTimes(2);
      expect(result.reindex.previousAttachmentDeleted).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("surfaces catalog recovery failures when the uploaded reset cannot be persisted", async () => {
    const deps = createDeps();
    deps.spies.recordIndexingState
      .mockRejectedValueOnce(new Error("reset-write-failed"))
      .mockResolvedValueOnce(
        createCatalogDocument({
          lastError:
            "Knowledge document mvp-2026-03/botanica-mvp-v1-corpus-mvp/v1 could not be reset to uploaded before reindexing: reset-write-failed. Catalog row marked as failed for operator review.",
          lastIndexedAt: "2026-03-31T09:25:00.000Z",
          status: "failed",
          vectorStoreId: null,
        }),
      );
    const reindexKnowledgeDocument = createReindexKnowledgeDocument(deps);

    await expect(
      reindexKnowledgeDocument({
        datasetVersion: "mvp-2026-03",
        docId: "botanica-mvp-v1-corpus-mvp",
        documentVersion: 1,
      }),
    ).rejects.toMatchObject({
      code: "catalog_record_failed",
      openAIFileId: "file_uploaded_123",
      vectorStoreId: null,
    });
    expect(deps.spies.recordIndexingState).toHaveBeenNthCalledWith(2, {
      datasetVersion: "mvp-2026-03",
      docId: "botanica-mvp-v1-corpus-mvp",
      documentVersion: 1,
      lastError:
        "Knowledge document mvp-2026-03/botanica-mvp-v1-corpus-mvp/v1 could not be reset to uploaded before reindexing: reset-write-failed",
      lastIndexedAt: expect.any(String),
      openAIFileId: "file_uploaded_123",
      status: "failed",
      vectorStoreId: null,
    });
  });
});
