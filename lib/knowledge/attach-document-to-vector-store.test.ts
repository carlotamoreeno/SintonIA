import { describe, expect, it, vi } from "vitest";
import { createAttachKnowledgeDocumentToVectorStore } from "./attach-document-to-vector-store-core";
import type { OpenAIVectorStoreFileChunkingStrategy } from "@/lib/openai/adapter-core";

function createCatalogDocument(overrides?: Record<string, unknown>) {
  return {
    id: "doc-row-1",
    docId: "botanica-mvp-v1-corpus-mvp",
    title: "Corpus botánico de prueba",
    originalFilename: "botanica-mvp-v1-corpus-mvp.pdf",
    documentVersion: 1,
    status: "uploaded" as const,
    canonicalPath:
      "datasets/mvp-2026-03/botanica-mvp-v1-corpus-mvp/v1/hash--botanica-mvp-v1-corpus-mvp.pdf",
    mimeType: "application/pdf",
    sha256: "a".repeat(64),
    datasetVersion: "mvp-2026-03",
    openAIFileId: "file_uploaded_123",
    vectorStoreId: null,
    customMetadata: {},
    lastIndexedAt: null,
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

function createDeps(
  vectorStoreFileChunkingStrategy: OpenAIVectorStoreFileChunkingStrategy = {
    type: "auto",
  },
) {
  const findDocumentByIdentity = vi
    .fn()
    .mockResolvedValue(createCatalogDocument());
  const recordVectorStoreIndexResult = vi.fn();
  const findByDatasetVersion = vi.fn().mockResolvedValue(createRegistration());
  const createVectorStoreFile = vi.fn().mockResolvedValue({
    _request_id: "req_attach_123",
    id: "file_uploaded_123",
    object: "vector_store.file",
    status: "in_progress",
    vector_store_id: "vs_123",
  });
  const deleteVectorStoreFile = vi.fn().mockResolvedValue({
    deleted: true,
    id: "file_uploaded_123",
    object: "vector_store.file.deleted",
  });
  const pollVectorStoreFile = vi.fn().mockResolvedValue({
    _request_id: "req_poll_123",
    id: "file_uploaded_123",
    last_error: null,
    object: "vector_store.file",
    status: "completed",
    vector_store_id: "vs_123",
    usage_bytes: 2048,
  });

  return {
    catalogStore: {
      findDocumentByIdentity,
      recordVectorStoreIndexResult,
    },
    openAI: {
      createVectorStoreFile,
      deleteVectorStoreFile,
      pollVectorStoreFile,
    },
    registryStore: {
      findByDatasetVersion,
    },
    vectorStoreFileChunkingStrategy,
    spies: {
      createVectorStoreFile,
      deleteVectorStoreFile,
      findByDatasetVersion,
      findDocumentByIdentity,
      pollVectorStoreFile,
      recordVectorStoreIndexResult,
    },
  };
}

describe("createAttachKnowledgeDocumentToVectorStore", () => {
  it("attaches a previously uploaded file, polls it to completion and records the ready status", async () => {
    const deps = createDeps();
    deps.spies.recordVectorStoreIndexResult
      .mockResolvedValueOnce(
        createCatalogDocument({
          status: "attached",
          vectorStoreId: "vs_123",
        }),
      )
      .mockResolvedValueOnce(
        createCatalogDocument({
          lastIndexedAt: "2026-03-31T09:10:00.000Z",
          status: "ready",
          vectorStoreId: "vs_123",
        }),
      );
    const attachKnowledgeDocumentToVectorStore =
      createAttachKnowledgeDocumentToVectorStore(deps);

    const result = await attachKnowledgeDocumentToVectorStore({
      datasetVersion: "mvp-2026-03",
      docId: "botanica-mvp-v1-corpus-mvp",
      documentVersion: 1,
    });

    expect(deps.spies.findByDatasetVersion).toHaveBeenCalledWith("mvp-2026-03");
    expect(deps.spies.createVectorStoreFile).toHaveBeenCalledWith("vs_123", {
      attributes: {
        dataset_version: "mvp-2026-03",
        doc_id: "botanica-mvp-v1-corpus-mvp",
        document_version: 1,
        mime_type: "application/pdf",
        title: "Corpus botánico de prueba",
      },
      chunking_strategy: {
        type: "auto",
      },
      file_id: "file_uploaded_123",
    });
    expect(deps.spies.recordVectorStoreIndexResult).toHaveBeenNthCalledWith(1, {
      datasetVersion: "mvp-2026-03",
      docId: "botanica-mvp-v1-corpus-mvp",
      documentVersion: 1,
      lastError: null,
      lastIndexedAt: null,
      status: "attached",
      vectorStoreId: "vs_123",
    });
    expect(deps.spies.pollVectorStoreFile).toHaveBeenCalledWith(
      "vs_123",
      "file_uploaded_123",
    );
    expect(deps.spies.recordVectorStoreIndexResult).toHaveBeenNthCalledWith(2, {
      datasetVersion: "mvp-2026-03",
      docId: "botanica-mvp-v1-corpus-mvp",
      documentVersion: 1,
      lastError: null,
      lastIndexedAt: expect.any(String),
      status: "ready",
      vectorStoreId: "vs_123",
    });
    expect(result).toEqual({
      document: {
        canonicalPath:
          "datasets/mvp-2026-03/botanica-mvp-v1-corpus-mvp/v1/hash--botanica-mvp-v1-corpus-mvp.pdf",
        datasetVersion: "mvp-2026-03",
        docId: "botanica-mvp-v1-corpus-mvp",
        documentVersion: 1,
        openAIFileId: "file_uploaded_123",
        status: "ready",
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
          type: "auto",
        },
        fileId: "file_uploaded_123",
        id: "vs_123",
        lastIndexedAt: expect.any(String),
        name: "sintonia-mvp-2026-03",
        requestId: "req_poll_123",
        status: "completed",
      },
    });
  });

  it("propagates the canonical and scalar custom metadata to the vector store file attributes", async () => {
    const deps = createDeps();
    deps.spies.findDocumentByIdentity.mockResolvedValue(
      createCatalogDocument({
        customMetadata: {
          AudienceLevel: "  principiantes  ",
          "Cultivation Zone": 9,
          internal: false,
          nested: {
            ignored: true,
          },
        },
      }),
    );
    deps.spies.recordVectorStoreIndexResult
      .mockResolvedValueOnce(
        createCatalogDocument({
          status: "attached",
          vectorStoreId: "vs_123",
        }),
      )
      .mockResolvedValueOnce(
        createCatalogDocument({
          lastIndexedAt: "2026-03-31T09:10:00.000Z",
          status: "ready",
          vectorStoreId: "vs_123",
        }),
      );
    const attachKnowledgeDocumentToVectorStore =
      createAttachKnowledgeDocumentToVectorStore(deps);

    const result = await attachKnowledgeDocumentToVectorStore({
      datasetVersion: "mvp-2026-03",
      docId: "botanica-mvp-v1-corpus-mvp",
      documentVersion: 1,
    });

    expect(deps.spies.createVectorStoreFile).toHaveBeenCalledWith("vs_123", {
      attributes: {
        dataset_version: "mvp-2026-03",
        doc_id: "botanica-mvp-v1-corpus-mvp",
        document_version: 1,
        mime_type: "application/pdf",
        title: "Corpus botánico de prueba",
        custom_audience_level: "principiantes",
        custom_cultivation_zone: 9,
        custom_internal: false,
      },
      chunking_strategy: {
        type: "auto",
      },
      file_id: "file_uploaded_123",
    });
    expect(result.vectorStore.attributes).toEqual({
      dataset_version: "mvp-2026-03",
      doc_id: "botanica-mvp-v1-corpus-mvp",
      document_version: 1,
      mime_type: "application/pdf",
      title: "Corpus botánico de prueba",
      custom_audience_level: "principiantes",
      custom_cultivation_zone: 9,
      custom_internal: false,
    });
  });

  it("passes a static chunking strategy through the attach flow and surfaces it in the result", async () => {
    const deps = createDeps({
      type: "static",
      static: {
        chunk_overlap_tokens: 128,
        max_chunk_size_tokens: 512,
      },
    });
    deps.spies.recordVectorStoreIndexResult
      .mockResolvedValueOnce(
        createCatalogDocument({
          status: "attached",
          vectorStoreId: "vs_123",
        }),
      )
      .mockResolvedValueOnce(
        createCatalogDocument({
          lastIndexedAt: "2026-03-31T09:10:00.000Z",
          status: "ready",
          vectorStoreId: "vs_123",
        }),
      );
    const attachKnowledgeDocumentToVectorStore =
      createAttachKnowledgeDocumentToVectorStore(deps);

    const result = await attachKnowledgeDocumentToVectorStore({
      datasetVersion: "mvp-2026-03",
      docId: "botanica-mvp-v1-corpus-mvp",
      documentVersion: 1,
    });

    expect(deps.spies.createVectorStoreFile).toHaveBeenCalledWith("vs_123", {
      attributes: {
        dataset_version: "mvp-2026-03",
        doc_id: "botanica-mvp-v1-corpus-mvp",
        document_version: 1,
        mime_type: "application/pdf",
        title: "Corpus botánico de prueba",
      },
      chunking_strategy: {
        type: "static",
        static: {
          chunk_overlap_tokens: 128,
          max_chunk_size_tokens: 512,
        },
      },
      file_id: "file_uploaded_123",
    });
    expect(result.vectorStore.chunkingStrategy).toEqual({
      type: "static",
      static: {
        chunk_overlap_tokens: 128,
        max_chunk_size_tokens: 512,
      },
    });
  });

  it("rejects documents that do not expose an openai_file_id", async () => {
    const deps = createDeps();
    deps.spies.findDocumentByIdentity.mockResolvedValue(
      createCatalogDocument({
        openAIFileId: null,
      }),
    );
    const attachKnowledgeDocumentToVectorStore =
      createAttachKnowledgeDocumentToVectorStore(deps);

    await expect(
      attachKnowledgeDocumentToVectorStore({
        datasetVersion: "mvp-2026-03",
        docId: "botanica-mvp-v1-corpus-mvp",
        documentVersion: 1,
      }),
    ).rejects.toMatchObject({
      code: "document_not_uploaded",
      message:
        "Knowledge document mvp-2026-03/botanica-mvp-v1-corpus-mvp/v1 does not have an openai_file_id yet.",
    });
  });

  it("rejects documents that are already indexed", async () => {
    const deps = createDeps();
    deps.spies.findDocumentByIdentity.mockResolvedValue(
      createCatalogDocument({
        status: "ready",
        vectorStoreId: "vs_123",
      }),
    );
    const attachKnowledgeDocumentToVectorStore =
      createAttachKnowledgeDocumentToVectorStore(deps);

    await expect(
      attachKnowledgeDocumentToVectorStore({
        datasetVersion: "mvp-2026-03",
        docId: "botanica-mvp-v1-corpus-mvp",
        documentVersion: 1,
      }),
    ).rejects.toMatchObject({
      code: "document_already_indexed",
      message:
        "Knowledge document mvp-2026-03/botanica-mvp-v1-corpus-mvp/v1 is already indexed in vector_store_id=vs_123.",
    });
  });

  it("rejects when the dataset does not have a registered vector store", async () => {
    const deps = createDeps();
    deps.spies.findByDatasetVersion.mockResolvedValue(null);
    const attachKnowledgeDocumentToVectorStore =
      createAttachKnowledgeDocumentToVectorStore(deps);

    await expect(
      attachKnowledgeDocumentToVectorStore({
        datasetVersion: "mvp-2026-03",
        docId: "botanica-mvp-v1-corpus-mvp",
        documentVersion: 1,
      }),
    ).rejects.toMatchObject({
      code: "vector_store_not_registered",
      message: "No vector store is registered for dataset_version=mvp-2026-03.",
    });
  });

  it("records a failed terminal status when OpenAI finishes the attachment unsuccessfully", async () => {
    const deps = createDeps();
    deps.spies.recordVectorStoreIndexResult.mockResolvedValueOnce(
      createCatalogDocument({
        status: "attached",
        vectorStoreId: "vs_123",
      }),
    );
    deps.spies.pollVectorStoreFile.mockResolvedValue({
      id: "file_uploaded_123",
      last_error: {
        code: "invalid_file",
        message: "The file could not be processed.",
      },
      object: "vector_store.file",
      status: "failed",
      vector_store_id: "vs_123",
      usage_bytes: 0,
    });
    deps.spies.recordVectorStoreIndexResult.mockResolvedValueOnce(
      createCatalogDocument({
        lastError:
          "Vector store file file_uploaded_123 finished with status failed. invalid_file: The file could not be processed.",
        lastIndexedAt: "2026-03-31T09:15:00.000Z",
        status: "failed",
        vectorStoreId: "vs_123",
      }),
    );
    const attachKnowledgeDocumentToVectorStore =
      createAttachKnowledgeDocumentToVectorStore(deps);

    const error = await attachKnowledgeDocumentToVectorStore({
      datasetVersion: "mvp-2026-03",
      docId: "botanica-mvp-v1-corpus-mvp",
      documentVersion: 1,
    }).catch((cause) => cause);

    expect(error).toMatchObject({
      code: "openai_vector_store_file_processing_failed",
      message:
        "Vector store file file_uploaded_123 finished with status failed. invalid_file: The file could not be processed.",
      openAIFileId: "file_uploaded_123",
      vectorStoreFileId: "file_uploaded_123",
      vectorStoreId: "vs_123",
    });
    expect(deps.spies.recordVectorStoreIndexResult).toHaveBeenNthCalledWith(2, {
      datasetVersion: "mvp-2026-03",
      docId: "botanica-mvp-v1-corpus-mvp",
      documentVersion: 1,
      lastError:
        "Vector store file file_uploaded_123 finished with status failed. invalid_file: The file could not be processed.",
      lastIndexedAt: expect.any(String),
      status: "failed",
      vectorStoreId: "vs_123",
    });
  });

  it("deletes the remote vector store file and records a retryable failed state when the attached status cannot be persisted", async () => {
    const deps = createDeps();
    deps.spies.recordVectorStoreIndexResult
      .mockRejectedValueOnce(new Error("catalog-write-failed"))
      .mockResolvedValueOnce(
        createCatalogDocument({
          lastError:
            "Vector store file file_uploaded_123 for vector store vs_123 could not be recorded as attached in knowledge_documents: catalog-write-failed. Remote vector store file deleted and catalog row marked as failed for retry.",
          status: "failed",
          vectorStoreId: null,
        }),
      );
    const attachKnowledgeDocumentToVectorStore =
      createAttachKnowledgeDocumentToVectorStore(deps);

    const error = await attachKnowledgeDocumentToVectorStore({
      datasetVersion: "mvp-2026-03",
      docId: "botanica-mvp-v1-corpus-mvp",
      documentVersion: 1,
    }).catch((cause) => cause);

    expect(error).toMatchObject({
      code: "catalog_record_failed",
      message:
        "Vector store file file_uploaded_123 for vector store vs_123 could not be recorded as attached in knowledge_documents: catalog-write-failed. Remote vector store file deleted and catalog row marked as failed for retry.",
      openAIFileId: "file_uploaded_123",
      vectorStoreFileId: "file_uploaded_123",
      vectorStoreId: "vs_123",
    });
    expect(deps.spies.deleteVectorStoreFile).toHaveBeenCalledWith(
      "vs_123",
      "file_uploaded_123",
    );
    expect(deps.spies.recordVectorStoreIndexResult).toHaveBeenNthCalledWith(2, {
      datasetVersion: "mvp-2026-03",
      docId: "botanica-mvp-v1-corpus-mvp",
      documentVersion: 1,
      lastError:
        "Vector store file file_uploaded_123 for vector store vs_123 could not be recorded as attached in knowledge_documents: catalog-write-failed. Remote vector store file deleted and catalog row marked as failed for retry.",
      lastIndexedAt: expect.any(String),
      status: "failed",
      vectorStoreId: null,
    });
  });

  it("keeps vector_store_id for traceability when attached-state cleanup fails", async () => {
    const deps = createDeps();
    deps.spies.deleteVectorStoreFile.mockRejectedValue(
      new Error("delete-boom"),
    );
    deps.spies.recordVectorStoreIndexResult
      .mockRejectedValueOnce(new Error("catalog-write-failed"))
      .mockResolvedValueOnce(
        createCatalogDocument({
          lastError:
            "Vector store file file_uploaded_123 for vector store vs_123 could not be recorded as attached in knowledge_documents: catalog-write-failed. Remote cleanup failed: delete-boom. Catalog row marked as failed with vector_store_id preserved for traceability. Manual cleanup is still required.",
          status: "failed",
          vectorStoreId: "vs_123",
        }),
      );
    const attachKnowledgeDocumentToVectorStore =
      createAttachKnowledgeDocumentToVectorStore(deps);

    const error = await attachKnowledgeDocumentToVectorStore({
      datasetVersion: "mvp-2026-03",
      docId: "botanica-mvp-v1-corpus-mvp",
      documentVersion: 1,
    }).catch((cause) => cause);

    expect(error).toMatchObject({
      code: "catalog_record_failed",
      message:
        "Vector store file file_uploaded_123 for vector store vs_123 could not be recorded as attached in knowledge_documents: catalog-write-failed. Remote cleanup failed: delete-boom. Catalog row marked as failed with vector_store_id preserved for traceability. Manual cleanup is still required.",
      vectorStoreId: "vs_123",
    });
    expect(deps.spies.recordVectorStoreIndexResult).toHaveBeenNthCalledWith(2, {
      datasetVersion: "mvp-2026-03",
      docId: "botanica-mvp-v1-corpus-mvp",
      documentVersion: 1,
      lastError:
        "Vector store file file_uploaded_123 for vector store vs_123 could not be recorded as attached in knowledge_documents: catalog-write-failed. Remote cleanup failed: delete-boom. Catalog row marked as failed with vector_store_id preserved for traceability. Manual cleanup is still required.",
      lastIndexedAt: expect.any(String),
      status: "failed",
      vectorStoreId: "vs_123",
    });
  });

  it("recovers with cleanup when recording a failed poll result also fails", async () => {
    const deps = createDeps();
    deps.spies.pollVectorStoreFile.mockRejectedValue(new Error("poll-boom"));
    deps.spies.recordVectorStoreIndexResult
      .mockResolvedValueOnce(
        createCatalogDocument({
          status: "attached",
          vectorStoreId: "vs_123",
        }),
      )
      .mockRejectedValueOnce(new Error("failed-write-boom"))
      .mockResolvedValueOnce(
        createCatalogDocument({
          lastError:
            "Vector store file file_uploaded_123 for vector store vs_123 could not be recorded as failed in knowledge_documents: failed-write-boom. Remote vector store file deleted and catalog row marked as failed for retry.",
          status: "failed",
          vectorStoreId: null,
        }),
      );
    const attachKnowledgeDocumentToVectorStore =
      createAttachKnowledgeDocumentToVectorStore(deps);

    const error = await attachKnowledgeDocumentToVectorStore({
      datasetVersion: "mvp-2026-03",
      docId: "botanica-mvp-v1-corpus-mvp",
      documentVersion: 1,
    }).catch((cause) => cause);

    expect(error).toMatchObject({
      code: "catalog_record_failed",
      message:
        "Vector store file file_uploaded_123 for vector store vs_123 could not be recorded as failed in knowledge_documents: failed-write-boom. Remote vector store file deleted and catalog row marked as failed for retry.",
    });
    expect(deps.spies.deleteVectorStoreFile).toHaveBeenCalledWith(
      "vs_123",
      "file_uploaded_123",
    );
    expect(deps.spies.recordVectorStoreIndexResult).toHaveBeenNthCalledWith(3, {
      datasetVersion: "mvp-2026-03",
      docId: "botanica-mvp-v1-corpus-mvp",
      documentVersion: 1,
      lastError:
        "Vector store file file_uploaded_123 for vector store vs_123 could not be recorded as failed in knowledge_documents: failed-write-boom. Remote vector store file deleted and catalog row marked as failed for retry.",
      lastIndexedAt: expect.any(String),
      status: "failed",
      vectorStoreId: null,
    });
  });

  it("recovers with a failed state when the ready status cannot be persisted after successful indexing", async () => {
    const deps = createDeps();
    deps.spies.recordVectorStoreIndexResult
      .mockResolvedValueOnce(
        createCatalogDocument({
          status: "attached",
          vectorStoreId: "vs_123",
        }),
      )
      .mockRejectedValueOnce(new Error("ready-write-failed"))
      .mockResolvedValueOnce(
        createCatalogDocument({
          lastError:
            "Vector store file file_uploaded_123 for vector store vs_123 could not be recorded as ready in knowledge_documents: ready-write-failed. Remote vector store file deleted and catalog row marked as failed for retry.",
          status: "failed",
          vectorStoreId: null,
        }),
      );
    const attachKnowledgeDocumentToVectorStore =
      createAttachKnowledgeDocumentToVectorStore(deps);

    const error = await attachKnowledgeDocumentToVectorStore({
      datasetVersion: "mvp-2026-03",
      docId: "botanica-mvp-v1-corpus-mvp",
      documentVersion: 1,
    }).catch((cause) => cause);

    expect(error).toMatchObject({
      code: "catalog_record_failed",
      message:
        "Vector store file file_uploaded_123 for vector store vs_123 could not be recorded as ready in knowledge_documents: ready-write-failed. Remote vector store file deleted and catalog row marked as failed for retry.",
    });
    expect(deps.spies.deleteVectorStoreFile).toHaveBeenCalledWith(
      "vs_123",
      "file_uploaded_123",
    );
    expect(deps.spies.recordVectorStoreIndexResult).toHaveBeenNthCalledWith(3, {
      datasetVersion: "mvp-2026-03",
      docId: "botanica-mvp-v1-corpus-mvp",
      documentVersion: 1,
      lastError:
        "Vector store file file_uploaded_123 for vector store vs_123 could not be recorded as ready in knowledge_documents: ready-write-failed. Remote vector store file deleted and catalog row marked as failed for retry.",
      lastIndexedAt: expect.any(String),
      status: "failed",
      vectorStoreId: null,
    });
  });
});
