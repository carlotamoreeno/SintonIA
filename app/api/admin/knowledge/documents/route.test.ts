import { beforeEach, describe, expect, it, vi } from "vitest";
import { UNAUTHENTICATED_API_MESSAGE } from "@/lib/auth/access";
import type { AppRole } from "@/lib/auth/roles";

const {
  AdminKnowledgeDocumentUploadErrorMock,
  getOptionalAppSessionMock,
  uploadAdminKnowledgeDocumentMock,
} = vi.hoisted(() => {
  class AdminKnowledgeDocumentUploadErrorMock extends Error {
    readonly code: string;

    constructor(input: { code: string; message: string }) {
      super(input.message);
      this.name = "AdminKnowledgeDocumentUploadError";
      this.code = input.code;
    }
  }

  return {
    AdminKnowledgeDocumentUploadErrorMock,
    getOptionalAppSessionMock: vi.fn(),
    uploadAdminKnowledgeDocumentMock: vi.fn(),
  };
});

vi.mock("@/lib/auth/app-session", () => ({
  getOptionalAppSession: getOptionalAppSessionMock,
}));

vi.mock("@/lib/knowledge/admin-document-upload", () => ({
  AdminKnowledgeDocumentUploadError: AdminKnowledgeDocumentUploadErrorMock,
  uploadAdminKnowledgeDocument: uploadAdminKnowledgeDocumentMock,
}));

function createAppSession(role: AppRole) {
  return {
    persistedIdentity: {
      user: {
        id: "persisted-user-1",
      },
    },
    session: {
      user: {
        id: "google:sub_123",
        role,
      },
    },
  };
}

function createUploadFormData(
  overrides: Partial<{
    datasetVersion: string;
    docId: string;
    documentVersion: string;
    file: File;
    title: string;
  }> = {},
) {
  const formData = new FormData();

  formData.set("datasetVersion", overrides.datasetVersion ?? "mvp-2026-03");
  formData.set("docId", overrides.docId ?? "orchid-care");
  formData.set("documentVersion", overrides.documentVersion ?? "2");
  formData.set("title", overrides.title ?? "Guia botanica");
  formData.set(
    "file",
    overrides.file ??
      new File(["%PDF-1.4\nT-56\n%%EOF"], "orchid-care.pdf", {
        type: "application/pdf",
      }),
  );

  return formData;
}

function createFormRequest(formData: FormData) {
  return {
    formData: vi.fn().mockResolvedValue(formData),
  } as unknown as Request;
}

function createMalformedFormRequest() {
  return {
    formData: vi.fn().mockRejectedValue(new Error("not multipart")),
  } as unknown as Request;
}

describe("POST /api/admin/knowledge/documents", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    uploadAdminKnowledgeDocumentMock.mockResolvedValue({
      document: {
        canonicalPath:
          "datasets/mvp-2026-03/orchid-care/v2/hash--orchid-care.pdf",
        datasetVersion: "mvp-2026-03",
        docId: "orchid-care",
        documentVersion: 2,
        lastIndexedAt: "2026-05-14T10:00:00.000Z",
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

  it("returns 401 when the request is unauthenticated", async () => {
    getOptionalAppSessionMock.mockResolvedValueOnce(null);

    const { POST } = await import("./route");
    const response = await POST(createFormRequest(createUploadFormData()));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      message: UNAUTHENTICATED_API_MESSAGE,
    });
    expect(uploadAdminKnowledgeDocumentMock).not.toHaveBeenCalled();
  });

  it("returns 403 for authenticated non-admin users", async () => {
    getOptionalAppSessionMock.mockResolvedValueOnce(createAppSession("user"));

    const { POST } = await import("./route");
    const response = await POST(createFormRequest(createUploadFormData()));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      message: "Forbidden",
    });
    expect(uploadAdminKnowledgeDocumentMock).not.toHaveBeenCalled();
  });

  it("returns 400 for malformed form data", async () => {
    getOptionalAppSessionMock.mockResolvedValueOnce(createAppSession("admin"));

    const { POST } = await import("./route");
    const response = await POST(createMalformedFormRequest());

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      issues: {
        form: ["Expected multipart form data."],
      },
      message: "Invalid request payload",
    });
    expect(uploadAdminKnowledgeDocumentMock).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid PDF payloads without exposing internal details", async () => {
    getOptionalAppSessionMock.mockResolvedValueOnce(createAppSession("expert"));
    uploadAdminKnowledgeDocumentMock.mockRejectedValueOnce(
      new AdminKnowledgeDocumentUploadErrorMock({
        code: "invalid_file",
        message: "Unsupported knowledge document MIME type: text/plain.",
      }),
    );

    const { POST } = await import("./route");
    const response = await POST(
      createFormRequest(
        createUploadFormData({
          file: new File(["plain"], "notes.txt", {
            type: "text/plain",
          }),
        }),
      ),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      code: "invalid_file",
      message: "Invalid request payload",
    });
  });

  it("returns 409 for duplicate document conflicts", async () => {
    getOptionalAppSessionMock.mockResolvedValueOnce(createAppSession("admin"));
    uploadAdminKnowledgeDocumentMock.mockRejectedValueOnce(
      new AdminKnowledgeDocumentUploadErrorMock({
        code: "duplicate_sha256",
        message: "A knowledge document with the same sha256 already exists.",
      }),
    );

    const { POST } = await import("./route");
    const response = await POST(createFormRequest(createUploadFormData()));

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      code: "duplicate_sha256",
      message: "Knowledge document already exists",
    });
  });

  it("returns 502 for storage or indexing failures", async () => {
    getOptionalAppSessionMock.mockResolvedValueOnce(createAppSession("admin"));
    uploadAdminKnowledgeDocumentMock.mockRejectedValueOnce(
      new AdminKnowledgeDocumentUploadErrorMock({
        code: "vector_store_attach_failed",
        message: "request_id=req_secret",
      }),
    );

    const { POST } = await import("./route");
    const response = await POST(createFormRequest(createUploadFormData()));

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({
      code: "vector_store_attach_failed",
      message: "Document upload failed",
    });
  });

  it("runs the upload for expert and admin users and returns the ready contract", async () => {
    getOptionalAppSessionMock.mockResolvedValueOnce(createAppSession("expert"));

    const { POST } = await import("./route");
    const response = await POST(createFormRequest(createUploadFormData()));

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
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
    expect(uploadAdminKnowledgeDocumentMock).toHaveBeenCalledWith({
      datasetVersion: "mvp-2026-03",
      docId: "orchid-care",
      documentVersion: 2,
      file: expect.any(Blob),
      title: "Guia botanica",
    });
  });
});
