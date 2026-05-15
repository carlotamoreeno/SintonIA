import { beforeEach, describe, expect, it, vi } from "vitest";
import { UNAUTHENTICATED_API_MESSAGE } from "@/lib/auth/access";
import type { AppRole } from "@/lib/auth/roles";

const {
  ReindexKnowledgeDocumentErrorMock,
  getOptionalAppSessionMock,
  reindexKnowledgeDocumentMock,
} = vi.hoisted(() => {
  class ReindexKnowledgeDocumentErrorMock extends Error {
    readonly code: string;

    constructor(input: { code: string; message: string }) {
      super(input.message);
      this.name = "ReindexKnowledgeDocumentError";
      this.code = input.code;
    }
  }

  return {
    ReindexKnowledgeDocumentErrorMock,
    getOptionalAppSessionMock: vi.fn(),
    reindexKnowledgeDocumentMock: vi.fn(),
  };
});

vi.mock("@/lib/auth/app-session", () => ({
  getOptionalAppSession: getOptionalAppSessionMock,
}));

vi.mock("@/lib/knowledge/reindex-knowledge-document", () => ({
  ReindexKnowledgeDocumentError: ReindexKnowledgeDocumentErrorMock,
  reindexKnowledgeDocument: reindexKnowledgeDocumentMock,
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

function createJsonRequest(body: unknown) {
  return {
    json: vi.fn().mockResolvedValue(body),
  } as unknown as Request;
}

function createMalformedJsonRequest() {
  return {
    json: vi.fn().mockRejectedValue(new Error("not-json")),
  } as unknown as Request;
}

function createReindexBody(
  overrides: Partial<{
    datasetVersion: unknown;
    docId: unknown;
    documentVersion: unknown;
  }> = {},
) {
  return {
    datasetVersion: overrides.datasetVersion ?? "mvp-2026-03",
    docId: overrides.docId ?? "orchid-care",
    documentVersion: overrides.documentVersion ?? 2,
  };
}

describe("POST /api/admin/knowledge/reindex", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    reindexKnowledgeDocumentMock.mockResolvedValue({
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
      reindex: {
        previousAttachmentDeleted: true,
        previousAttachmentMissing: false,
        previousVectorStoreId: "vs_previous",
        resetStatus: "uploaded",
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
    const response = await POST(createJsonRequest(createReindexBody()));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      message: UNAUTHENTICATED_API_MESSAGE,
    });
    expect(reindexKnowledgeDocumentMock).not.toHaveBeenCalled();
  });

  it("returns 403 for authenticated non-admin users", async () => {
    getOptionalAppSessionMock.mockResolvedValueOnce(createAppSession("user"));

    const { POST } = await import("./route");
    const response = await POST(createJsonRequest(createReindexBody()));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      message: "Forbidden",
    });
    expect(reindexKnowledgeDocumentMock).not.toHaveBeenCalled();
  });

  it("returns 400 for malformed JSON", async () => {
    getOptionalAppSessionMock.mockResolvedValueOnce(createAppSession("admin"));

    const { POST } = await import("./route");
    const response = await POST(createMalformedJsonRequest());

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      issues: {
        body: ["Expected JSON body."],
      },
      message: "Invalid request payload",
    });
    expect(reindexKnowledgeDocumentMock).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid document identity payloads", async () => {
    getOptionalAppSessionMock.mockResolvedValueOnce(createAppSession("expert"));

    const { POST } = await import("./route");
    const response = await POST(
      createJsonRequest(
        createReindexBody({
          datasetVersion: "",
          documentVersion: "2",
        }),
      ),
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body).toMatchObject({
      message: "Invalid request payload",
    });
    expect(body.issues.datasetVersion).toBeDefined();
    expect(body.issues.documentVersion).toBeDefined();
    expect(reindexKnowledgeDocumentMock).not.toHaveBeenCalled();
  });

  it("returns 409 for non-reindexable catalog preconditions", async () => {
    getOptionalAppSessionMock.mockResolvedValueOnce(createAppSession("admin"));
    reindexKnowledgeDocumentMock.mockRejectedValueOnce(
      new ReindexKnowledgeDocumentErrorMock({
        code: "document_retired",
        message: "secret catalog detail",
      }),
    );

    const { POST } = await import("./route");
    const response = await POST(createJsonRequest(createReindexBody()));

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      code: "document_retired",
      message: "Knowledge document cannot be reindexed",
    });
  });

  it("returns 502 for upstream reindex failures without leaking internals", async () => {
    getOptionalAppSessionMock.mockResolvedValueOnce(createAppSession("admin"));
    reindexKnowledgeDocumentMock.mockRejectedValueOnce(
      new ReindexKnowledgeDocumentErrorMock({
        code: "reindex_attach_failed",
        message: "request_id=req_secret",
      }),
    );

    const { POST } = await import("./route");
    const response = await POST(createJsonRequest(createReindexBody()));

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({
      code: "reindex_attach_failed",
      message: "Document reindex failed",
    });
  });

  it.each(["expert", "admin"] as const)(
    "runs the reindex for %s users and returns the refreshed contract",
    async (role) => {
      getOptionalAppSessionMock.mockResolvedValueOnce(createAppSession(role));

      const { POST } = await import("./route");
      const response = await POST(createJsonRequest(createReindexBody()));

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({
        document: {
          datasetVersion: "mvp-2026-03",
          docId: "orchid-care",
          documentVersion: 2,
          openAIFileId: "file_123",
          status: "ready",
          vectorStoreId: "vs_123",
        },
        reindex: {
          previousAttachmentDeleted: true,
          previousAttachmentMissing: false,
          resetStatus: "uploaded",
        },
        vectorStore: {
          fileId: "file_123",
          id: "vs_123",
          requestId: "req_attach_123",
          status: "completed",
        },
      });
      expect(reindexKnowledgeDocumentMock).toHaveBeenCalledWith({
        datasetVersion: "mvp-2026-03",
        docId: "orchid-care",
        documentVersion: 2,
      });
    },
  );
});
