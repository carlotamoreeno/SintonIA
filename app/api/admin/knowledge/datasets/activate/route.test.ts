import { beforeEach, describe, expect, it, vi } from "vitest";
import { UNAUTHENTICATED_API_MESSAGE } from "@/lib/auth/access";
import type { AppRole } from "@/lib/auth/roles";

const {
  ActivateKnowledgeDatasetErrorMock,
  activateKnowledgeDatasetMock,
  getOptionalAppSessionMock,
} = vi.hoisted(() => {
  class ActivateKnowledgeDatasetErrorMock extends Error {
    readonly code: string;

    constructor(input: { code: string; message: string }) {
      super(input.message);
      this.name = "ActivateKnowledgeDatasetError";
      this.code = input.code;
    }
  }

  return {
    ActivateKnowledgeDatasetErrorMock,
    activateKnowledgeDatasetMock: vi.fn(),
    getOptionalAppSessionMock: vi.fn(),
  };
});

vi.mock("@/lib/auth/app-session", () => ({
  getOptionalAppSession: getOptionalAppSessionMock,
}));

vi.mock("@/lib/knowledge/activate-dataset", () => ({
  ActivateKnowledgeDatasetError: ActivateKnowledgeDatasetErrorMock,
  activateKnowledgeDataset: activateKnowledgeDatasetMock,
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

describe("POST /api/admin/knowledge/datasets/activate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    activateKnowledgeDatasetMock.mockResolvedValue({
      activatedAt: "2026-05-14T10:00:00.000Z",
      activeDataset: {
        datasetVersion: "mvp-2026-03",
        vectorStoreId: "vs_123",
      },
      changed: true,
      previousDataset: null,
      vectorStoreId: "vs_123",
    });
  });

  it("returns 401 when the request is unauthenticated", async () => {
    getOptionalAppSessionMock.mockResolvedValueOnce(null);

    const { POST } = await import("./route");
    const response = await POST(
      createJsonRequest({ datasetVersion: "mvp-2026-03" }),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      message: UNAUTHENTICATED_API_MESSAGE,
    });
    expect(activateKnowledgeDatasetMock).not.toHaveBeenCalled();
  });

  it("returns 403 for authenticated non-admin users", async () => {
    getOptionalAppSessionMock.mockResolvedValueOnce(createAppSession("user"));

    const { POST } = await import("./route");
    const response = await POST(
      createJsonRequest({ datasetVersion: "mvp-2026-03" }),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      message: "Forbidden",
    });
    expect(activateKnowledgeDatasetMock).not.toHaveBeenCalled();
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
    expect(activateKnowledgeDatasetMock).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid activation payloads", async () => {
    getOptionalAppSessionMock.mockResolvedValueOnce(createAppSession("expert"));

    const { POST } = await import("./route");
    const response = await POST(createJsonRequest({ datasetVersion: "" }));

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body).toMatchObject({
      message: "Invalid request payload",
    });
    expect(body.issues.datasetVersion).toBeDefined();
    expect(activateKnowledgeDatasetMock).not.toHaveBeenCalled();
  });

  it("returns 409 when the dataset cannot be activated", async () => {
    getOptionalAppSessionMock.mockResolvedValueOnce(createAppSession("admin"));
    activateKnowledgeDatasetMock.mockRejectedValueOnce(
      new ActivateKnowledgeDatasetErrorMock({
        code: "vector_store_not_registered",
        message: "secret dataset detail",
      }),
    );

    const { POST } = await import("./route");
    const response = await POST(
      createJsonRequest({ datasetVersion: "missing-dataset" }),
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      code: "vector_store_not_registered",
      message: "Knowledge dataset cannot be activated",
    });
  });

  it("returns 502 when readiness or persistence fails without leaking internals", async () => {
    getOptionalAppSessionMock.mockResolvedValueOnce(createAppSession("admin"));
    activateKnowledgeDatasetMock.mockRejectedValueOnce(
      new ActivateKnowledgeDatasetErrorMock({
        code: "vector_store_not_ready",
        message: "request_id=req_secret",
      }),
    );

    const { POST } = await import("./route");
    const response = await POST(
      createJsonRequest({ datasetVersion: "mvp-2026-03" }),
    );

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({
      code: "vector_store_not_ready",
      message: "Dataset activation failed",
    });
  });

  it.each(["expert", "admin"] as const)(
    "activates the dataset for %s users",
    async (role) => {
      getOptionalAppSessionMock.mockResolvedValueOnce(createAppSession(role));

      const { POST } = await import("./route");
      const response = await POST(
        createJsonRequest({ datasetVersion: " mvp-2026-03 " }),
      );

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({
        activatedAt: "2026-05-14T10:00:00.000Z",
        activeDataset: {
          datasetVersion: "mvp-2026-03",
          vectorStoreId: "vs_123",
        },
        changed: true,
        previousDataset: null,
        vectorStoreId: "vs_123",
      });
      expect(activateKnowledgeDatasetMock).toHaveBeenCalledWith({
        activatedByUserId: "persisted-user-1",
        datasetVersion: "mvp-2026-03",
      });
    },
  );

  it("returns an idempotent success when the dataset is already active", async () => {
    getOptionalAppSessionMock.mockResolvedValueOnce(createAppSession("admin"));
    activateKnowledgeDatasetMock.mockResolvedValueOnce({
      activatedAt: "2026-05-14T09:00:00.000Z",
      activeDataset: {
        datasetVersion: "mvp-2026-03",
        vectorStoreId: "vs_123",
      },
      changed: false,
      previousDataset: {
        datasetVersion: "mvp-2026-03",
        vectorStoreId: "vs_123",
      },
      vectorStoreId: "vs_123",
    });

    const { POST } = await import("./route");
    const response = await POST(
      createJsonRequest({ datasetVersion: "mvp-2026-03" }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      changed: false,
      previousDataset: {
        datasetVersion: "mvp-2026-03",
        vectorStoreId: "vs_123",
      },
      vectorStoreId: "vs_123",
    });
  });
});
