import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  formatInitialCatalogManifestVerification,
  INITIAL_CATALOG_MANIFEST_VERSION,
  loadInitialCatalogManifest,
  verifyInitialCatalogManifest,
  type InitialCatalogManifest,
} from "./initial-manifest";

function createTestDocument() {
  const content = "Documento botánico de prueba para T-21";
  const sha256 = createHash("sha256").update(content).digest("hex");

  return {
    blob: new Blob([content], {
      type: "application/pdf",
    }),
    document: {
      bucket: "knowledge-documents",
      canonicalPath:
        "datasets/mvp-2026-03/botanica-mvp-v1-corpus-mvp/v1/hash--botanica.pdf",
      customMetadata: {},
      datasetVersion: "mvp-2026-03",
      docId: "botanica-mvp-v1-corpus-mvp",
      documentVersion: 1,
      lastErrorExpected: null,
      mimeType: "application/pdf",
      openaiFileId: "file_test_123",
      openaiFilePurpose: "assistants" as const,
      openaiFileStatus: "processed" as const,
      originalFilename: "botanica.pdf",
      searchProbe: "botanica",
      sha256,
      sizeBytes: content.length,
      status: "ready" as const,
      title: "Corpus botánico de prueba",
      vectorStoreFileStatus: "completed" as const,
      vectorStoreId: "vs_test_123",
    },
  };
}

function createManifest(): InitialCatalogManifest {
  const { document } = createTestDocument();

  return {
    manifestVersion: INITIAL_CATALOG_MANIFEST_VERSION,
    documents: [document],
  };
}

function createDeps() {
  const { blob, document } = createTestDocument();

  return {
    catalogStore: {
      findDocumentByIdentity: vi.fn().mockResolvedValue({
        id: "row_123",
        docId: document.docId,
        title: document.title,
        originalFilename: document.originalFilename,
        documentVersion: document.documentVersion,
        status: document.status,
        canonicalPath: document.canonicalPath,
        mimeType: document.mimeType,
        sha256: document.sha256,
        datasetVersion: document.datasetVersion,
        openAIFileId: document.openaiFileId,
        vectorStoreId: document.vectorStoreId,
        customMetadata: document.customMetadata,
        lastIndexedAt: "2026-03-30T15:53:00.240Z",
        lastError: document.lastErrorExpected,
        createdAt: "2026-03-30T15:37:24.868Z",
        updatedAt: "2026-03-30T15:37:24.868Z",
      }),
      findFirstDocumentBySha256: vi.fn(),
      recordOpenAIUploadResult: vi.fn(),
    },
    openAI: {
      retrieveFile: vi.fn().mockResolvedValue({
        filename: document.originalFilename,
        id: document.openaiFileId,
        purpose: document.openaiFilePurpose,
        status: document.openaiFileStatus,
      }),
      retrieveVectorStoreFile: vi.fn().mockResolvedValue({
        id: document.openaiFileId,
        last_error: document.lastErrorExpected,
        status: document.vectorStoreFileStatus,
        vector_store_id: document.vectorStoreId,
      }),
      searchVectorStore: vi.fn().mockResolvedValue({
        data: [
          {
            attributes: {
              dataset_version: document.datasetVersion,
              doc_id: document.docId,
              document_version: document.documentVersion,
            },
            content: [
              {
                text: "Documento botánico de prueba para T-21",
                type: "text",
              },
            ],
            file_id: document.openaiFileId,
          },
        ],
      }),
    },
    supabase: {
      storage: {
        from: vi.fn().mockReturnValue({
          download: vi.fn().mockResolvedValue({
            data: blob,
            error: null,
          }),
          info: vi.fn().mockResolvedValue({
            data: {
              contentType: document.mimeType,
              metadata: {},
              size: document.sizeBytes,
            },
            error: null,
          }),
        }),
      },
    },
  };
}

describe("loadInitialCatalogManifest", () => {
  it("loads the committed botanica manifest entry", () => {
    const manifest = loadInitialCatalogManifest();

    expect(manifest).toMatchObject({
      documents: [
        {
          bucket: "knowledge-documents",
          datasetVersion: "mvp-2026-03",
          docId: "botanica-mvp-v1-corpus-mvp",
          documentVersion: 1,
          openaiFileId: "file-ASiQHbsz76KbGc6o7WMfE3",
          vectorStoreId: "vs_69ca9b4e5e2081919bec55eb91742f70",
        },
      ],
      manifestVersion: 1,
    });
  });

  it("rejects invalid manifest input", () => {
    expect(() =>
      loadInitialCatalogManifest({
        documents: [
          {
            bucket: "knowledge-documents",
            canonicalPath: "",
          },
        ],
        manifestVersion: 99,
      }),
    ).toThrow();
  });
});

describe("verifyInitialCatalogManifest", () => {
  it("verifies the happy path end to end", async () => {
    const deps = createDeps();

    const result = await verifyInitialCatalogManifest(deps, createManifest());

    expect(result.ok).toBe(true);
    expect(result.documents[0]).toMatchObject({
      catalogDocumentId: "row_123",
      failures: [],
      openAIFileStatus: "processed",
      searchHitCount: 1,
      storageObjectSize: createTestDocument().document.sizeBytes,
      vectorStoreFileStatus: "completed",
    });
    expect(formatInitialCatalogManifestVerification(result)).toContain(
      "Initial catalog manifest verification: PASS",
    );
  });

  it("fails when the catalog row is missing", async () => {
    const deps = createDeps();
    deps.catalogStore.findDocumentByIdentity.mockResolvedValue(null);

    const result = await verifyInitialCatalogManifest(deps, createManifest());

    expect(result.ok).toBe(false);
    expect(result.documents[0].failures).toContain(
      "Catalog row not found for mvp-2026-03/botanica-mvp-v1-corpus-mvp/v1.",
    );
  });

  it("fails when the storage object hash drifts", async () => {
    const deps = createDeps();
    const storageBucket = deps.supabase.storage.from(
      createManifest().documents[0].bucket,
    );
    storageBucket.download.mockResolvedValue({
      data: new Blob(["contenido distinto"], {
        type: "application/pdf",
      }),
      error: null,
    });

    const result = await verifyInitialCatalogManifest(deps, createManifest());

    expect(result.ok).toBe(false);
    expect(
      result.documents[0].failures.some((failure) =>
        failure.includes("Storage sha256 mismatch"),
      ),
    ).toBe(true);
  });

  it("fails when the OpenAI file is not processed", async () => {
    const deps = createDeps();
    deps.openAI.retrieveFile.mockResolvedValue({
      filename: "botanica.pdf",
      id: "file_test_123",
      purpose: "assistants",
      status: "uploaded",
    });

    const result = await verifyInitialCatalogManifest(deps, createManifest());

    expect(result.ok).toBe(false);
    expect(result.documents[0].failures).toContain(
      "OpenAI file status mismatch: expected processed, received uploaded.",
    );
  });

  it("fails when the vector store file is not completed", async () => {
    const deps = createDeps();
    deps.openAI.retrieveVectorStoreFile.mockResolvedValue({
      id: "file_test_123",
      last_error: {
        code: "server_error",
        message: "processing failed",
      },
      status: "failed",
      vector_store_id: "vs_test_123",
    });

    const result = await verifyInitialCatalogManifest(deps, createManifest());

    expect(result.ok).toBe(false);
    expect(result.documents[0].failures).toContain(
      "Vector store file status mismatch: expected completed, received failed.",
    );
  });

  it("fails when vector store search returns no matching hit", async () => {
    const deps = createDeps();
    deps.openAI.searchVectorStore.mockResolvedValue({
      data: [],
    });

    const result = await verifyInitialCatalogManifest(deps, createManifest());

    expect(result.ok).toBe(false);
    expect(result.documents[0].failures).toContain(
      "Vector store search did not return a hit for file_test_123.",
    );
  });
});
