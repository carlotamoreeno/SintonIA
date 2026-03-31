import { describe, expect, it, vi } from "vitest";
import { KNOWLEDGE_DOCUMENTS_STORAGE_BUCKET } from "./document-metadata";
import { createUploadKnowledgeDocumentToOpenAI } from "./openai-file-upload-core";

function createCatalogDocument(overrides?: Record<string, unknown>) {
  return {
    id: "doc-row-1",
    docId: "botanica-mvp-v1-corpus-mvp",
    title: "Corpus botánico de prueba",
    originalFilename: "botanica-mvp-v1-corpus-mvp.pdf",
    documentVersion: 1,
    status: "pending" as const,
    canonicalPath:
      "datasets/mvp-2026-03/botanica-mvp-v1-corpus-mvp/v1/hash--botanica-mvp-v1-corpus-mvp.pdf",
    mimeType: "application/pdf",
    sha256: "a".repeat(64),
    datasetVersion: "mvp-2026-03",
    openAIFileId: null,
    vectorStoreId: null,
    customMetadata: {},
    lastIndexedAt: null,
    lastError: null,
    createdAt: "2026-03-30T15:37:24.868Z",
    updatedAt: "2026-03-30T15:37:24.868Z",
    ...overrides,
  };
}

function createDeps() {
  const recordIndexingState = vi.fn();
  const findDocumentByIdentity = vi
    .fn()
    .mockResolvedValue(createCatalogDocument());
  const download = vi.fn().mockResolvedValue({
    data: new Blob(["%PDF-1.4 botanical test"], {
      type: "application/pdf",
    }),
    error: null,
  });
  const storageFrom = vi.fn().mockReturnValue({
    download,
  });
  const createFile = vi.fn().mockResolvedValue({
    filename: "botanica-mvp-v1-corpus-mvp.pdf",
    id: "file_uploaded_123",
    purpose: "assistants",
    status: "uploaded",
  });
  const deleteFile = vi.fn().mockResolvedValue({
    deleted: true,
    id: "file_uploaded_123",
    object: "file",
  });
  const waitForFileProcessing = vi.fn().mockResolvedValue({
    _request_id: "req_upload_123",
    bytes: 131989,
    filename: "botanica-mvp-v1-corpus-mvp.pdf",
    id: "file_uploaded_123",
    object: "file",
    purpose: "assistants",
    status: "processed",
  });

  return {
    catalogStore: {
      findDocumentByIdentity,
      recordIndexingState,
    },
    openAI: {
      createFile,
      deleteFile,
      waitForFileProcessing,
    },
    supabase: {
      storage: {
        from: storageFrom,
      },
    },
    spies: {
      createFile,
      deleteFile,
      download,
      findDocumentByIdentity,
      recordIndexingState,
      storageFrom,
      waitForFileProcessing,
    },
  };
}

describe("createUploadKnowledgeDocumentToOpenAI", () => {
  it("uploads the canonical storage object to OpenAI and records the uploaded status", async () => {
    const deps = createDeps();
    deps.spies.recordIndexingState.mockResolvedValue(
      createCatalogDocument({
        openAIFileId: "file_uploaded_123",
        status: "uploaded",
      }),
    );
    const uploadKnowledgeDocumentToOpenAI =
      createUploadKnowledgeDocumentToOpenAI(deps);

    const result = await uploadKnowledgeDocumentToOpenAI({
      datasetVersion: "mvp-2026-03",
      docId: "botanica-mvp-v1-corpus-mvp",
      documentVersion: 1,
    });

    expect(deps.spies.findDocumentByIdentity).toHaveBeenCalledWith({
      datasetVersion: "mvp-2026-03",
      docId: "botanica-mvp-v1-corpus-mvp",
      documentVersion: 1,
    });
    expect(deps.spies.storageFrom).toHaveBeenCalledWith(
      KNOWLEDGE_DOCUMENTS_STORAGE_BUCKET,
    );
    expect(deps.spies.download).toHaveBeenCalledWith(
      "datasets/mvp-2026-03/botanica-mvp-v1-corpus-mvp/v1/hash--botanica-mvp-v1-corpus-mvp.pdf",
    );
    expect(deps.spies.createFile).toHaveBeenCalledWith({
      file: expect.any(File),
      purpose: "assistants",
    });
    expect(
      (deps.spies.createFile.mock.calls[0]?.[0] as { file: File }).file.name,
    ).toBe("botanica-mvp-v1-corpus-mvp.pdf");
    expect(deps.spies.waitForFileProcessing).toHaveBeenCalledWith(
      "file_uploaded_123",
    );
    expect(deps.spies.deleteFile).not.toHaveBeenCalled();
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
    expect(result).toEqual({
      document: {
        canonicalPath:
          "datasets/mvp-2026-03/botanica-mvp-v1-corpus-mvp/v1/hash--botanica-mvp-v1-corpus-mvp.pdf",
        datasetVersion: "mvp-2026-03",
        docId: "botanica-mvp-v1-corpus-mvp",
        documentVersion: 1,
        mimeType: "application/pdf",
        originalFilename: "botanica-mvp-v1-corpus-mvp.pdf",
        status: "uploaded",
      },
      openAIFile: {
        bytes: 131989,
        filename: "botanica-mvp-v1-corpus-mvp.pdf",
        id: "file_uploaded_123",
        purpose: "assistants",
        requestId: "req_upload_123",
        status: "processed",
      },
      storage: {
        bucket: KNOWLEDGE_DOCUMENTS_STORAGE_BUCKET,
        sizeBytes: 23,
      },
    });
  });

  it("deletes the remote file and records a retryable failed state when the uploaded result cannot be persisted", async () => {
    const deps = createDeps();
    deps.spies.recordIndexingState
      .mockRejectedValueOnce(new Error("catalog-write-failed"))
      .mockResolvedValueOnce(
        createCatalogDocument({
          lastError:
            "Processed OpenAI file file_uploaded_123 could not be recorded as uploaded in knowledge_documents: catalog-write-failed. Remote OpenAI file deleted and catalog row marked as failed for retry.",
          openAIFileId: null,
          status: "failed",
        }),
      );
    const uploadKnowledgeDocumentToOpenAI =
      createUploadKnowledgeDocumentToOpenAI(deps);

    const error = await uploadKnowledgeDocumentToOpenAI({
      datasetVersion: "mvp-2026-03",
      docId: "botanica-mvp-v1-corpus-mvp",
      documentVersion: 1,
    }).catch((cause) => cause);

    expect(error).toMatchObject({
      code: "catalog_record_failed",
      message:
        "Processed OpenAI file file_uploaded_123 could not be recorded as uploaded in knowledge_documents: catalog-write-failed. Remote OpenAI file deleted and catalog row marked as failed for retry.",
      openAIFileId: "file_uploaded_123",
    });
    expect(deps.spies.deleteFile).toHaveBeenCalledWith("file_uploaded_123");
    expect(deps.spies.recordIndexingState).toHaveBeenNthCalledWith(1, {
      datasetVersion: "mvp-2026-03",
      docId: "botanica-mvp-v1-corpus-mvp",
      documentVersion: 1,
      lastError: null,
      lastIndexedAt: null,
      openAIFileId: "file_uploaded_123",
      status: "uploaded",
      vectorStoreId: null,
    });
    expect(deps.spies.recordIndexingState).toHaveBeenNthCalledWith(2, {
      datasetVersion: "mvp-2026-03",
      docId: "botanica-mvp-v1-corpus-mvp",
      documentVersion: 1,
      lastError:
        "Processed OpenAI file file_uploaded_123 could not be recorded as uploaded in knowledge_documents: catalog-write-failed. Remote OpenAI file deleted and catalog row marked as failed for retry.",
      lastIndexedAt: null,
      openAIFileId: null,
      status: "failed",
      vectorStoreId: null,
    });
  });

  it("records a failed state with the original openai_file_id when remote cleanup fails", async () => {
    const deps = createDeps();
    deps.spies.deleteFile.mockRejectedValue(new Error("delete-boom"));
    deps.spies.recordIndexingState
      .mockRejectedValueOnce(new Error("catalog-write-failed"))
      .mockResolvedValueOnce(
        createCatalogDocument({
          lastError:
            "Processed OpenAI file file_uploaded_123 could not be recorded as uploaded in knowledge_documents: catalog-write-failed. Remote cleanup failed: delete-boom. Catalog row marked as failed with openai_file_id preserved for traceability. Manual cleanup is still required.",
          openAIFileId: "file_uploaded_123",
          status: "failed",
        }),
      );
    const uploadKnowledgeDocumentToOpenAI =
      createUploadKnowledgeDocumentToOpenAI(deps);

    const error = await uploadKnowledgeDocumentToOpenAI({
      datasetVersion: "mvp-2026-03",
      docId: "botanica-mvp-v1-corpus-mvp",
      documentVersion: 1,
    }).catch((cause) => cause);

    expect(error).toMatchObject({
      code: "catalog_record_failed",
      message:
        "Processed OpenAI file file_uploaded_123 could not be recorded as uploaded in knowledge_documents: catalog-write-failed. Remote cleanup failed: delete-boom. Catalog row marked as failed with openai_file_id preserved for traceability. Manual cleanup is still required.",
      openAIFileId: "file_uploaded_123",
    });
    expect(deps.spies.recordIndexingState).toHaveBeenNthCalledWith(2, {
      datasetVersion: "mvp-2026-03",
      docId: "botanica-mvp-v1-corpus-mvp",
      documentVersion: 1,
      lastError:
        "Processed OpenAI file file_uploaded_123 could not be recorded as uploaded in knowledge_documents: catalog-write-failed. Remote cleanup failed: delete-boom. Catalog row marked as failed with openai_file_id preserved for traceability. Manual cleanup is still required.",
      lastIndexedAt: null,
      openAIFileId: "file_uploaded_123",
      status: "failed",
      vectorStoreId: null,
    });
  });

  it("keeps the error structured when recovery persistence fails after deleting the remote file", async () => {
    const deps = createDeps();
    deps.spies.recordIndexingState
      .mockRejectedValueOnce(new Error("catalog-write-failed"))
      .mockRejectedValueOnce(new Error("recovery-boom"));
    const uploadKnowledgeDocumentToOpenAI =
      createUploadKnowledgeDocumentToOpenAI(deps);

    const error = await uploadKnowledgeDocumentToOpenAI({
      datasetVersion: "mvp-2026-03",
      docId: "botanica-mvp-v1-corpus-mvp",
      documentVersion: 1,
    }).catch((cause) => cause);

    expect(error).toMatchObject({
      code: "catalog_record_failed",
      message:
        "Processed OpenAI file file_uploaded_123 could not be recorded as uploaded in knowledge_documents: catalog-write-failed. Remote OpenAI file deleted, but recording the failed recovery state also failed: recovery-boom. Manual catalog reconciliation is required.",
      openAIFileId: "file_uploaded_123",
    });
    expect(error.cause).toMatchObject({
      recoveredCatalogOpenAIFileId: null,
      recoveryError: expect.any(Error),
      remoteFileDeleted: true,
    });
  });

  it("keeps the error structured when both remote cleanup and recovery persistence fail", async () => {
    const deps = createDeps();
    deps.spies.deleteFile.mockRejectedValue(new Error("delete-boom"));
    deps.spies.recordIndexingState
      .mockRejectedValueOnce(new Error("catalog-write-failed"))
      .mockRejectedValueOnce(new Error("recovery-boom"));
    const uploadKnowledgeDocumentToOpenAI =
      createUploadKnowledgeDocumentToOpenAI(deps);

    const error = await uploadKnowledgeDocumentToOpenAI({
      datasetVersion: "mvp-2026-03",
      docId: "botanica-mvp-v1-corpus-mvp",
      documentVersion: 1,
    }).catch((cause) => cause);

    expect(error).toMatchObject({
      code: "catalog_record_failed",
      message:
        "Processed OpenAI file file_uploaded_123 could not be recorded as uploaded in knowledge_documents: catalog-write-failed. Remote cleanup failed: delete-boom. Recording the failed recovery state also failed: recovery-boom. Manual cleanup and catalog reconciliation are required.",
      openAIFileId: "file_uploaded_123",
    });
    expect(error.cause).toMatchObject({
      recoveredCatalogOpenAIFileId: "file_uploaded_123",
      recoveryError: expect.any(Error),
      remoteFileDeleteError: expect.any(Error),
      remoteFileDeleted: false,
    });
  });

  it("rejects when the catalog row does not exist", async () => {
    const deps = createDeps();
    deps.spies.findDocumentByIdentity.mockResolvedValue(null);
    const uploadKnowledgeDocumentToOpenAI =
      createUploadKnowledgeDocumentToOpenAI(deps);

    await expect(
      uploadKnowledgeDocumentToOpenAI({
        datasetVersion: "mvp-2026-03",
        docId: "missing-doc",
        documentVersion: 1,
      }),
    ).rejects.toMatchObject({
      code: "document_not_found",
      name: "UploadKnowledgeDocumentToOpenAIError",
    });
    expect(deps.spies.download).not.toHaveBeenCalled();
    expect(deps.spies.recordIndexingState).not.toHaveBeenCalled();
  });

  it("rejects retired catalog rows before touching storage", async () => {
    const deps = createDeps();
    deps.spies.findDocumentByIdentity.mockResolvedValue(
      createCatalogDocument({
        status: "retired",
      }),
    );
    const uploadKnowledgeDocumentToOpenAI =
      createUploadKnowledgeDocumentToOpenAI(deps);

    await expect(
      uploadKnowledgeDocumentToOpenAI({
        datasetVersion: "mvp-2026-03",
        docId: "botanica-mvp-v1-corpus-mvp",
        documentVersion: 1,
      }),
    ).rejects.toMatchObject({
      code: "document_retired",
    });
    expect(deps.spies.download).not.toHaveBeenCalled();
    expect(deps.spies.recordIndexingState).not.toHaveBeenCalled();
  });

  it("rejects rows that already expose an openai_file_id", async () => {
    const deps = createDeps();
    deps.spies.findDocumentByIdentity.mockResolvedValue(
      createCatalogDocument({
        openAIFileId: "file_existing_123",
        status: "uploaded",
      }),
    );
    const uploadKnowledgeDocumentToOpenAI =
      createUploadKnowledgeDocumentToOpenAI(deps);

    await expect(
      uploadKnowledgeDocumentToOpenAI({
        datasetVersion: "mvp-2026-03",
        docId: "botanica-mvp-v1-corpus-mvp",
        documentVersion: 1,
      }),
    ).rejects.toMatchObject({
      code: "document_already_uploaded",
      openAIFileId: "file_existing_123",
    });
    expect(deps.spies.createFile).not.toHaveBeenCalled();
    expect(deps.spies.recordIndexingState).not.toHaveBeenCalled();
  });

  it("records a failed result when the canonical storage object cannot be downloaded", async () => {
    const deps = createDeps();
    deps.spies.download.mockResolvedValue({
      data: null,
      error: {
        message: "Object not found",
      },
    });
    deps.spies.recordIndexingState.mockResolvedValue(
      createCatalogDocument({
        lastError:
          "Failed to download datasets/mvp-2026-03/botanica-mvp-v1-corpus-mvp/v1/hash--botanica-mvp-v1-corpus-mvp.pdf from knowledge-documents: Object not found",
        status: "failed",
      }),
    );
    const uploadKnowledgeDocumentToOpenAI =
      createUploadKnowledgeDocumentToOpenAI(deps);

    await expect(
      uploadKnowledgeDocumentToOpenAI({
        datasetVersion: "mvp-2026-03",
        docId: "botanica-mvp-v1-corpus-mvp",
        documentVersion: 1,
      }),
    ).rejects.toMatchObject({
      code: "storage_download_failed",
      name: "UploadKnowledgeDocumentToOpenAIError",
      openAIFileId: null,
    });
    expect(deps.spies.recordIndexingState).toHaveBeenCalledWith({
      datasetVersion: "mvp-2026-03",
      docId: "botanica-mvp-v1-corpus-mvp",
      documentVersion: 1,
      lastError:
        "Failed to download datasets/mvp-2026-03/botanica-mvp-v1-corpus-mvp/v1/hash--botanica-mvp-v1-corpus-mvp.pdf from knowledge-documents: Object not found",
      lastIndexedAt: null,
      openAIFileId: null,
      status: "failed",
      vectorStoreId: null,
    });
    expect(deps.spies.createFile).not.toHaveBeenCalled();
  });

  it("records the issued openai_file_id when processing ends in error", async () => {
    const deps = createDeps();
    deps.spies.waitForFileProcessing.mockResolvedValue({
      bytes: 131989,
      filename: "botanica-mvp-v1-corpus-mvp.pdf",
      id: "file_uploaded_123",
      object: "file",
      purpose: "assistants",
      status: "error",
    });
    deps.spies.recordIndexingState.mockResolvedValue(
      createCatalogDocument({
        lastError: "OpenAI file file_uploaded_123 finished with status error.",
        openAIFileId: "file_uploaded_123",
        status: "failed",
      }),
    );
    const uploadKnowledgeDocumentToOpenAI =
      createUploadKnowledgeDocumentToOpenAI(deps);

    await expect(
      uploadKnowledgeDocumentToOpenAI({
        datasetVersion: "mvp-2026-03",
        docId: "botanica-mvp-v1-corpus-mvp",
        documentVersion: 1,
      }),
    ).rejects.toMatchObject({
      code: "openai_file_processing_failed",
      openAIFileId: "file_uploaded_123",
    });
    expect(deps.spies.recordIndexingState).toHaveBeenCalledWith({
      datasetVersion: "mvp-2026-03",
      docId: "botanica-mvp-v1-corpus-mvp",
      documentVersion: 1,
      lastError: "OpenAI file file_uploaded_123 finished with status error.",
      lastIndexedAt: null,
      openAIFileId: "file_uploaded_123",
      status: "failed",
      vectorStoreId: null,
    });
  });

  it("surfaces a catalog persistence error if the failed upload cannot be recorded", async () => {
    const deps = createDeps();
    deps.spies.waitForFileProcessing.mockResolvedValue({
      bytes: 131989,
      filename: "botanica-mvp-v1-corpus-mvp.pdf",
      id: "file_uploaded_123",
      object: "file",
      purpose: "assistants",
      status: "error",
    });
    deps.spies.recordIndexingState.mockRejectedValue(new Error("catalog-boom"));
    const uploadKnowledgeDocumentToOpenAI =
      createUploadKnowledgeDocumentToOpenAI(deps);

    await expect(
      uploadKnowledgeDocumentToOpenAI({
        datasetVersion: "mvp-2026-03",
        docId: "botanica-mvp-v1-corpus-mvp",
        documentVersion: 1,
      }),
    ).rejects.toEqual(
      expect.objectContaining({
        code: "catalog_record_failed",
        openAIFileId: "file_uploaded_123",
      }),
    );
  });
});
