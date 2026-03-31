import { describe, expect, it, vi } from "vitest";
import {
  KnowledgeDocumentValidationError,
  MAX_KNOWLEDGE_DOCUMENT_SIZE_BYTES,
  validateKnowledgeDocumentCandidate,
} from "./document-validation";

function createMockStore() {
  return {
    findDocumentByIdentity: vi.fn(),
    findFirstDocumentBySha256: vi.fn().mockResolvedValue(null),
    recordIndexingState: vi.fn(),
  };
}

describe("validateKnowledgeDocumentCandidate", () => {
  it("accepts a valid PDF candidate and normalizes sha256 and MIME type", async () => {
    const store = createMockStore();

    await expect(
      validateKnowledgeDocumentCandidate(
        {
          datasetVersion: " mvp-2026-03 ",
          docId: " orchid-care ",
          title: " Guia de orquideas ",
          originalFilename: " orchid-guide.pdf ",
          mimeType: "APPLICATION/PDF",
          sha256: `${"A".repeat(32)}${"b".repeat(32)}`,
          sizeBytes: MAX_KNOWLEDGE_DOCUMENT_SIZE_BYTES,
        },
        store,
      ),
    ).resolves.toEqual({
      datasetVersion: "mvp-2026-03",
      docId: "orchid-care",
      title: "Guia de orquideas",
      originalFilename: "orchid-guide.pdf",
      mimeType: "application/pdf",
      sha256: `${"a".repeat(32)}${"b".repeat(32)}`,
      sizeBytes: MAX_KNOWLEDGE_DOCUMENT_SIZE_BYTES,
    });
    expect(store.findFirstDocumentBySha256).toHaveBeenCalledWith(
      `${"a".repeat(32)}${"b".repeat(32)}`,
    );
  });

  it("rejects unsupported MIME types", async () => {
    const store = createMockStore();

    await expect(
      validateKnowledgeDocumentCandidate(
        {
          datasetVersion: "mvp-2026-03",
          docId: "orchid-care",
          title: "Guia de orquideas",
          originalFilename: "orchid-guide.txt",
          mimeType: "text/plain",
          sha256: "a".repeat(64),
          sizeBytes: 1024,
        },
        store,
      ),
    ).rejects.toMatchObject({
      code: "invalid_mime_type",
      details: {
        receivedMimeType: "text/plain",
      },
      message: "Unsupported knowledge document MIME type: text/plain.",
      name: "KnowledgeDocumentValidationError",
    });
    expect(store.findFirstDocumentBySha256).not.toHaveBeenCalled();
  });

  it("rejects files larger than the MVP PDF limit", async () => {
    const store = createMockStore();

    await expect(
      validateKnowledgeDocumentCandidate(
        {
          datasetVersion: "mvp-2026-03",
          docId: "orchid-care",
          title: "Guia de orquideas",
          originalFilename: "orchid-guide.pdf",
          mimeType: "application/pdf",
          sha256: "a".repeat(64),
          sizeBytes: MAX_KNOWLEDGE_DOCUMENT_SIZE_BYTES + 1,
        },
        store,
      ),
    ).rejects.toMatchObject({
      code: "file_too_large",
      details: {
        maxSizeBytes: MAX_KNOWLEDGE_DOCUMENT_SIZE_BYTES,
        sizeBytes: MAX_KNOWLEDGE_DOCUMENT_SIZE_BYTES + 1,
      },
      name: "KnowledgeDocumentValidationError",
    });
    expect(store.findFirstDocumentBySha256).not.toHaveBeenCalled();
  });

  it("rejects invalid sha256 values before consulting the catalog", async () => {
    const store = createMockStore();

    await expect(
      validateKnowledgeDocumentCandidate(
        {
          datasetVersion: "mvp-2026-03",
          docId: "orchid-care",
          title: "Guia de orquideas",
          originalFilename: "orchid-guide.pdf",
          mimeType: "application/pdf",
          sha256: "not-a-valid-sha",
          sizeBytes: 1024,
        },
        store,
      ),
    ).rejects.toMatchObject({
      code: "invalid_sha256",
      details: {
        sha256: "not-a-valid-sha",
      },
      message:
        "Knowledge document sha256 must be a 64-character hexadecimal string.",
      name: "KnowledgeDocumentValidationError",
    });
    expect(store.findFirstDocumentBySha256).not.toHaveBeenCalled();
  });

  it("rejects missing required metadata with a deterministic error code", async () => {
    const store = createMockStore();

    await expect(
      validateKnowledgeDocumentCandidate(
        {
          datasetVersion: "mvp-2026-03",
          docId: "orchid-care",
          title: "   ",
          originalFilename: "orchid-guide.pdf",
          mimeType: "application/pdf",
          sha256: "a".repeat(64),
          sizeBytes: 1024,
        },
        store,
      ),
    ).rejects.toMatchObject({
      code: "missing_required_metadata",
      details: {
        fields: ["title"],
      },
      name: "KnowledgeDocumentValidationError",
    });
    expect(store.findFirstDocumentBySha256).not.toHaveBeenCalled();
  });

  it("rejects duplicates globally by sha256 and exposes the existing catalog row", async () => {
    const store = createMockStore();
    const duplicate = {
      id: "doc-row-1",
      docId: "orchid-care",
      title: "Guia de orquideas",
      documentVersion: 2,
      datasetVersion: "legacy-dataset",
      canonicalPath:
        "datasets/legacy-dataset/orchid-care/v2/abcd--orchid-guide.pdf",
      sha256: "a".repeat(64),
      status: "ready",
      createdAt: "2026-03-30T10:00:00.000Z",
    };
    store.findFirstDocumentBySha256.mockResolvedValue(duplicate);

    const result = validateKnowledgeDocumentCandidate(
      {
        datasetVersion: "mvp-2026-03",
        docId: "orchid-care-v2",
        title: "Nueva guia de orquideas",
        originalFilename: "orchid-guide-v2.pdf",
        mimeType: "application/pdf",
        sha256: "a".repeat(64),
        sizeBytes: 1024,
      },
      store,
    );

    await expect(result).rejects.toMatchObject({
      code: "duplicate_sha256",
      duplicate,
      message:
        "A knowledge document with the same sha256 already exists in the catalog.",
      name: "KnowledgeDocumentValidationError",
    });
  });

  it("preserves the specialized validation error type for downstream callers", async () => {
    const store = createMockStore();

    try {
      await validateKnowledgeDocumentCandidate(
        {
          datasetVersion: "mvp-2026-03",
          docId: "orchid-care",
          title: "Guia de orquideas",
          originalFilename: "orchid-guide.txt",
          mimeType: "text/plain",
          sha256: "a".repeat(64),
          sizeBytes: 1024,
        },
        store,
      );
    } catch (error) {
      expect(error).toBeInstanceOf(KnowledgeDocumentValidationError);
    }
  });
});
