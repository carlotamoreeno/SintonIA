import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { AttachKnowledgeDocumentToVectorStoreError } from "./attach-document-to-vector-store-core";
import {
  buildKnowledgeDocumentCanonicalPath,
  buildSafeKnowledgeDocumentFilename,
  createAdminKnowledgeDocumentUpload,
} from "./admin-document-upload-core";

function createPdfFile(content = "%PDF-1.4\nT-56\n%%EOF") {
  return new File([content], " Guia botanica final.pdf ", {
    type: "application/pdf",
  });
}

function sha256Hex(content: string) {
  return createHash("sha256").update(Buffer.from(content)).digest("hex");
}

function createCatalogDocument(overrides: Record<string, unknown> = {}) {
  return {
    id: "doc-row-1",
    canonicalPath:
      "datasets/mvp-2026-03/orchid-care/v2/hash--guia-botanica-final.pdf",
    createdAt: "2026-03-30T10:00:00.000Z",
    customMetadata: {},
    datasetVersion: "mvp-2026-03",
    docId: "orchid-care",
    documentVersion: 2,
    lastError: null,
    lastIndexedAt: null,
    mimeType: "application/pdf",
    openAIFileId: null,
    originalFilename: "Guia botanica final.pdf",
    sha256: "a".repeat(64),
    status: "pending",
    title: "Guia botanica",
    updatedAt: "2026-03-30T10:00:00.000Z",
    vectorStoreId: null,
    ...overrides,
  };
}

function createDeps() {
  const uploadMock = vi.fn().mockResolvedValue({
    error: null,
  });
  const removeMock = vi.fn().mockResolvedValue({
    error: null,
  });

  return {
    attachToVectorStore: vi.fn().mockResolvedValue({
      document: {
        canonicalPath:
          "datasets/mvp-2026-03/orchid-care/v2/hash--guia-botanica-final.pdf",
        datasetVersion: "mvp-2026-03",
        docId: "orchid-care",
        documentVersion: 2,
        openAIFileId: "file_123",
        status: "ready",
      },
      vectorStore: {
        attributes: {},
        chunkingStrategy: {
          type: "auto",
        },
        fileId: "file_123",
        id: "vs_123",
        lastIndexedAt: "2026-05-14T10:00:00.000Z",
        name: "mvp-2026-03",
        requestId: "req_attach_123",
        status: "completed",
      },
    }),
    catalogStore: {
      createPendingDocument: vi.fn().mockResolvedValue(createCatalogDocument()),
      findFirstDocumentBySha256: vi.fn().mockResolvedValue(null),
    },
    storage: {
      storage: {
        from: vi.fn().mockReturnValue({
          remove: removeMock,
          upload: uploadMock,
        }),
      },
    },
    uploadMock,
    removeMock,
    uploadToOpenAI: vi.fn().mockResolvedValue({
      document: {
        canonicalPath:
          "datasets/mvp-2026-03/orchid-care/v2/hash--guia-botanica-final.pdf",
        datasetVersion: "mvp-2026-03",
        docId: "orchid-care",
        documentVersion: 2,
        mimeType: "application/pdf",
        originalFilename: "Guia botanica final.pdf",
        status: "uploaded",
      },
      openAIFile: {
        bytes: 256,
        filename: "Guia botanica final.pdf",
        id: "file_123",
        purpose: "assistants",
        requestId: "req_upload_123",
        status: "processed",
      },
      storage: {
        bucket: "knowledge-documents",
        sizeBytes: 256,
      },
    }),
  };
}

describe("admin knowledge document upload", () => {
  it("builds safe filenames and canonical paths deterministically", () => {
    expect(
      buildSafeKnowledgeDocumentFilename(" Guía botánica final.pdf "),
    ).toBe("guia-botanica-final.pdf");
    expect(buildSafeKnowledgeDocumentFilename("../Report Final")).toBe(
      "report-final.pdf",
    );
    expect(
      buildKnowledgeDocumentCanonicalPath({
        datasetVersion: "mvp-2026-03",
        docId: "orchid-care",
        documentVersion: 2,
        safeFilename: "guia-botanica-final.pdf",
        sha256: "a".repeat(64),
      }),
    ).toBe(
      `datasets/mvp-2026-03/orchid-care/v2/${"a".repeat(64)}--guia-botanica-final.pdf`,
    );
  });

  it("stores, catalogs, uploads and attaches a valid PDF", async () => {
    const deps = createDeps();
    const uploadAdminKnowledgeDocument =
      createAdminKnowledgeDocumentUpload(deps);
    const fileContent = "%PDF-1.4\nT-56\n%%EOF";
    const file = createPdfFile(fileContent);
    const expectedSha256 = sha256Hex(fileContent);

    const result = await uploadAdminKnowledgeDocument({
      datasetVersion: "mvp-2026-03",
      docId: "orchid-care",
      documentVersion: 2,
      file,
      title: "Guia botanica",
    });

    const expectedCanonicalPath = `datasets/mvp-2026-03/orchid-care/v2/${expectedSha256}--guia-botanica-final.pdf`;

    expect(deps.catalogStore.findFirstDocumentBySha256).toHaveBeenCalledWith(
      expectedSha256,
    );
    expect(deps.storage.storage.from).toHaveBeenCalledWith(
      "knowledge-documents",
    );
    expect(deps.uploadMock).toHaveBeenCalledWith(
      expectedCanonicalPath,
      file,
      expect.objectContaining({
        contentType: "application/pdf",
        metadata: expect.objectContaining({
          dataset_version: "mvp-2026-03",
          doc_id: "orchid-care",
          document_version: 2,
          sha256: expectedSha256,
        }),
        upsert: false,
      }),
    );
    expect(deps.catalogStore.createPendingDocument).toHaveBeenCalledWith(
      expect.objectContaining({
        canonicalPath: expectedCanonicalPath,
        datasetVersion: "mvp-2026-03",
        docId: "orchid-care",
        documentVersion: 2,
        mimeType: "application/pdf",
        originalFilename: "Guia botanica final.pdf",
        sha256: expectedSha256,
      }),
    );
    expect(deps.uploadToOpenAI).toHaveBeenCalledWith({
      datasetVersion: "mvp-2026-03",
      docId: "orchid-care",
      documentVersion: 2,
    });
    expect(deps.attachToVectorStore).toHaveBeenCalledWith({
      datasetVersion: "mvp-2026-03",
      docId: "orchid-care",
      documentVersion: 2,
    });
    expect(result).toMatchObject({
      document: {
        datasetVersion: "mvp-2026-03",
        docId: "orchid-care",
        documentVersion: 2,
        openAIFileId: "file_123",
        status: "ready",
        vectorStoreId: "vs_123",
      },
      openAIFile: {
        id: "file_123",
        requestId: "req_upload_123",
        status: "processed",
      },
      vectorStore: {
        fileId: "file_123",
        id: "vs_123",
        requestId: "req_attach_123",
        status: "completed",
      },
    });
  });

  it("rejects duplicate PDF hashes before writing storage or catalog rows", async () => {
    const deps = createDeps();
    deps.catalogStore.findFirstDocumentBySha256.mockResolvedValueOnce(
      createCatalogDocument({
        sha256: sha256Hex("%PDF-1.4\nT-56\n%%EOF"),
      }),
    );
    const uploadAdminKnowledgeDocument =
      createAdminKnowledgeDocumentUpload(deps);

    await expect(
      uploadAdminKnowledgeDocument({
        datasetVersion: "mvp-2026-03",
        docId: "orchid-care",
        documentVersion: 2,
        file: createPdfFile(),
        title: "Guia botanica",
      }),
    ).rejects.toMatchObject({
      code: "duplicate_sha256",
      name: "AdminKnowledgeDocumentUploadError",
    });
    expect(deps.uploadMock).not.toHaveBeenCalled();
    expect(deps.catalogStore.createPendingDocument).not.toHaveBeenCalled();
  });

  it("cleans up the storage object when catalog insertion fails", async () => {
    const deps = createDeps();
    deps.catalogStore.createPendingDocument.mockRejectedValueOnce(
      new Error("duplicate key value violates unique constraint"),
    );
    const uploadAdminKnowledgeDocument =
      createAdminKnowledgeDocumentUpload(deps);

    await expect(
      uploadAdminKnowledgeDocument({
        datasetVersion: "mvp-2026-03",
        docId: "orchid-care",
        documentVersion: 2,
        file: createPdfFile(),
        title: "Guia botanica",
      }),
    ).rejects.toMatchObject({
      code: "catalog_conflict",
      name: "AdminKnowledgeDocumentUploadError",
    });
    expect(deps.removeMock).toHaveBeenCalledWith([
      expect.stringMatching(
        /^datasets\/mvp-2026-03\/orchid-care\/v2\/[a-f0-9]{64}--guia-botanica-final\.pdf$/,
      ),
    ]);
    expect(deps.uploadToOpenAI).not.toHaveBeenCalled();
    expect(deps.attachToVectorStore).not.toHaveBeenCalled();
  });

  it("preserves indexed state handling in existing helpers when attach fails", async () => {
    const deps = createDeps();
    deps.attachToVectorStore.mockRejectedValueOnce(
      new AttachKnowledgeDocumentToVectorStoreError({
        code: "openai_vector_store_attach_failed",
        message: "provider failed",
        openAIFileId: "file_123",
        vectorStoreId: "vs_123",
      }),
    );
    const uploadAdminKnowledgeDocument =
      createAdminKnowledgeDocumentUpload(deps);

    await expect(
      uploadAdminKnowledgeDocument({
        datasetVersion: "mvp-2026-03",
        docId: "orchid-care",
        documentVersion: 2,
        file: createPdfFile(),
        title: "Guia botanica",
      }),
    ).rejects.toMatchObject({
      code: "vector_store_attach_failed",
      name: "AdminKnowledgeDocumentUploadError",
    });
    expect(deps.removeMock).not.toHaveBeenCalled();
  });

  it("rejects unsafe dataset and document path segments", async () => {
    const deps = createDeps();
    const uploadAdminKnowledgeDocument =
      createAdminKnowledgeDocumentUpload(deps);

    await expect(
      uploadAdminKnowledgeDocument({
        datasetVersion: "../mvp",
        docId: "orchid-care",
        documentVersion: 2,
        file: createPdfFile(),
        title: "Guia botanica",
      }),
    ).rejects.toMatchObject({
      code: "invalid_path_segment",
      name: "AdminKnowledgeDocumentUploadError",
    });
    expect(deps.uploadMock).not.toHaveBeenCalled();
  });
});
