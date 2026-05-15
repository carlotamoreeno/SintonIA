import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppRole } from "@/lib/auth/roles";

const {
  getOptionalAppSessionMock,
  listDocumentsMock,
  listRegistrationsMock,
  redirectMock,
  refreshMock,
  resolveActiveDatasetMock,
} = vi.hoisted(() => ({
  getOptionalAppSessionMock: vi.fn(),
  listDocumentsMock: vi.fn(),
  listRegistrationsMock: vi.fn(),
  redirectMock: vi.fn(),
  refreshMock: vi.fn(),
  resolveActiveDatasetMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
  useRouter: () => ({
    refresh: refreshMock,
  }),
}));

vi.mock("@/lib/auth/app-session", () => ({
  getOptionalAppSession: getOptionalAppSessionMock,
}));

vi.mock("@/lib/supabase/knowledge-document-store", () => ({
  knowledgeDocumentCatalogStore: {
    listDocuments: listDocumentsMock,
  },
}));

vi.mock("@/lib/supabase/knowledge-vector-store-registry", () => ({
  knowledgeVectorStoreRegistrationStore: {
    listRegistrations: listRegistrationsMock,
  },
}));

vi.mock("@/lib/knowledge/active-dataset", () => ({
  activeKnowledgeDatasetResolver: {
    resolveActiveDataset: resolveActiveDatasetMock,
  },
}));

vi.mock("@/components/auth/sign-out-form", () => ({
  SignOutForm: ({ label = "Cerrar sesion" }: { label?: string }) => (
    <button type="button">{label}</button>
  ),
}));

function createAppSession(role: AppRole) {
  return {
    persistedIdentity: {
      user: {
        id: "persisted-user-1",
      },
    },
    session: {
      expires: "2099-01-01T00:00:00.000Z",
      user: {
        id: "google:sub_123",
        role,
        email: `${role}@example.com`,
        name: `${role} user`,
        image: null,
      },
    },
  };
}

function createKnowledgeDocument(
  overrides: Partial<{
    docId: string;
    lastError: string | null;
    lastIndexedAt: string | null;
    openAIFileId: string | null;
    status: string;
    title: string;
    vectorStoreId: string | null;
  }> = {},
) {
  const docId = overrides.docId ?? "botanica-mvp-v1-corpus-mvp";

  return {
    id: `row-${docId}`,
    canonicalPath: `datasets/mvp-2026-03/${docId}/v1/hash--${docId}.pdf`,
    createdAt: "2026-03-30T10:00:00.000Z",
    customMetadata: {},
    datasetVersion: "mvp-2026-03",
    docId,
    documentVersion: 1,
    lastError: overrides.lastError ?? null,
    lastIndexedAt: overrides.lastIndexedAt ?? "2026-04-01T10:00:00.000Z",
    mimeType: "application/pdf",
    openAIFileId:
      overrides.openAIFileId !== undefined
        ? overrides.openAIFileId
        : "file_123",
    originalFilename: `${docId}.pdf`,
    sha256: "a".repeat(64),
    status: overrides.status ?? "ready",
    title: overrides.title ?? "Corpus MVP botanico",
    updatedAt: "2026-04-01T10:00:00.000Z",
    vectorStoreId:
      overrides.vectorStoreId !== undefined
        ? overrides.vectorStoreId
        : "vs_123",
  };
}

function createVectorStoreRegistration(
  overrides: Partial<{
    activatedAt: string | null;
    datasetVersion: string;
    isActive: boolean;
    name: string;
    vectorStoreId: string;
  }> = {},
) {
  const datasetVersion = overrides.datasetVersion ?? "mvp-2026-03";

  return {
    activatedAt: overrides.activatedAt ?? "2026-05-14T09:00:00.000Z",
    activatedByUserId: "persisted-user-1",
    createdAt: "2026-03-31T08:00:00.000Z",
    datasetVersion,
    id: `registry-${datasetVersion}`,
    isActive: overrides.isActive ?? true,
    name: overrides.name ?? `sintonia-${datasetVersion}`,
    updatedAt: "2026-05-14T09:00:00.000Z",
    vectorStoreId: overrides.vectorStoreId ?? "vs_123",
  };
}

async function renderAdminKnowledgePage() {
  const { default: AdminKnowledgePage } = await import("./page");

  return render(await AdminKnowledgePage());
}

describe("AdminKnowledgePage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listDocumentsMock.mockResolvedValue([]);
    listRegistrationsMock.mockResolvedValue([createVectorStoreRegistration()]);
    resolveActiveDatasetMock.mockResolvedValue({
      activatedAt: "2026-05-14T09:00:00.000Z",
      datasetVersion: "mvp-2026-03",
      source: "active_registry",
      vectorStoreId: "vs_123",
    });
    redirectMock.mockImplementation((path: string) => {
      throw new Error(`REDIRECT:${path}`);
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("redirects anonymous users to sign-in with the admin callback", async () => {
    getOptionalAppSessionMock.mockResolvedValueOnce(null);

    await expect(renderAdminKnowledgePage()).rejects.toThrow(
      "REDIRECT:/sign-in?callbackUrl=%2Fadmin%2Fknowledge",
    );
    expect(listDocumentsMock).not.toHaveBeenCalled();
    expect(listRegistrationsMock).not.toHaveBeenCalled();
    expect(screen.queryByText(/subir documento/i)).not.toBeInTheDocument();
  });

  it("renders a restricted state for regular authenticated users", async () => {
    getOptionalAppSessionMock.mockResolvedValueOnce(createAppSession("user"));

    await renderAdminKnowledgePage();

    expect(
      screen.getByRole("heading", {
        name: /acceso restringido/i,
      }),
    ).toBeInTheDocument();
    expect(screen.getByText(/no tiene permisos/i)).toBeInTheDocument();
    expect(screen.queryByText(/base protegida/i)).not.toBeInTheDocument();
    expect(listDocumentsMock).not.toHaveBeenCalled();
    expect(listRegistrationsMock).not.toHaveBeenCalled();
  });

  it.each(["expert", "admin"] as const)(
    "renders the admin shell for %s users",
    async (role) => {
      getOptionalAppSessionMock.mockResolvedValueOnce(createAppSession(role));

      await renderAdminKnowledgePage();

      expect(
        screen.getByRole("heading", {
          name: /panel documental/i,
        }),
      ).toBeInTheDocument();
      expect(screen.getByText(/base protegida/i)).toBeInTheDocument();
      expect(
        screen.getByText(new RegExp(`rol ${role}`, "i")),
      ).toBeInTheDocument();
      expect(listDocumentsMock).toHaveBeenCalledWith({
        limit: 100,
      });
      expect(listRegistrationsMock).toHaveBeenCalled();
      expect(screen.getByText(/dataset activo/i)).toBeInTheDocument();
      expect(screen.getByText(/sintonia-mvp-2026-03/i)).toBeInTheDocument();
      expect(screen.getByText(/subir documento/i)).toBeInTheDocument();
      expect(
        screen.getByLabelText(/^dataset$/i, { selector: "input" }),
      ).toBeInTheDocument();
      expect(screen.getByLabelText(/doc id/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/pdf/i)).toBeInTheDocument();
      expect(
        screen.getByText(/no hay documentos catalogados/i),
      ).toBeInTheDocument();
    },
  );

  it("renders the document inventory with indexing status and problem rows", async () => {
    listDocumentsMock.mockResolvedValueOnce([
      createKnowledgeDocument(),
      createKnowledgeDocument({
        docId: "orchid-care",
        lastError: "Vector store file finished with status failed.",
        openAIFileId: "file_failed",
        status: "failed",
        title: "Guia de orquideas",
        vectorStoreId: null,
      }),
    ]);
    getOptionalAppSessionMock.mockResolvedValueOnce(createAppSession("admin"));

    await renderAdminKnowledgePage();

    expect(screen.getByText("Inventario documental")).toBeInTheDocument();
    expect(screen.getByText("Corpus MVP botanico")).toBeInTheDocument();
    expect(screen.getByText("Guia de orquideas")).toBeInTheDocument();
    expect(screen.getAllByText("mvp-2026-03").length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText("Activo").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("file_123")).toBeInTheDocument();
    expect(screen.getByText("Pendiente")).toBeInTheDocument();
    expect(screen.getByText("Listo")).toBeInTheDocument();
    expect(screen.getByText("Con error")).toBeInTheDocument();
    expect(
      screen.getByText("Vector store file finished with status failed."),
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole("button", {
        name: /reindexar/i,
      }),
    ).toHaveLength(2);
    expect(screen.getByText("Documentos cargados")).toBeInTheDocument();
    expect(screen.getByText("Listos para consulta")).toBeInTheDocument();
    expect(screen.getByText("Con incidencias visibles")).toBeInTheDocument();
  });

  it("submits an individual reindex and refreshes the inventory after success", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          document: {
            status: "ready",
          },
        }),
        {
          status: 200,
        },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    listDocumentsMock.mockResolvedValueOnce([createKnowledgeDocument()]);
    getOptionalAppSessionMock.mockResolvedValueOnce(createAppSession("admin"));

    await renderAdminKnowledgePage();
    fireEvent.click(
      screen.getByRole("button", {
        name: /reindexar corpus mvp botanico/i,
      }),
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/admin/knowledge/reindex", {
        body: JSON.stringify({
          datasetVersion: "mvp-2026-03",
          docId: "botanica-mvp-v1-corpus-mvp",
          documentVersion: 1,
        }),
        headers: {
          "Content-Type": "application/json",
        },
        method: "POST",
      });
    });
    expect(
      await screen.findByText(/documento reindexado/i),
    ).toBeInTheDocument();
    expect(refreshMock).toHaveBeenCalled();
  });

  it("activates a registered dataset and refreshes the admin state", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          activeDataset: {
            datasetVersion: "next-2026-05",
            vectorStoreId: "vs_next",
          },
          changed: true,
        }),
        {
          status: 200,
        },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    listRegistrationsMock.mockResolvedValueOnce([
      createVectorStoreRegistration(),
      createVectorStoreRegistration({
        activatedAt: null,
        datasetVersion: "next-2026-05",
        isActive: false,
        name: "sintonia-next-2026-05",
        vectorStoreId: "vs_next",
      }),
    ]);
    getOptionalAppSessionMock.mockResolvedValueOnce(createAppSession("admin"));

    await renderAdminKnowledgePage();
    fireEvent.click(
      screen.getByRole("button", {
        name: /activar dataset next-2026-05/i,
      }),
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/admin/knowledge/datasets/activate",
        {
          body: JSON.stringify({
            datasetVersion: "next-2026-05",
          }),
          headers: {
            "Content-Type": "application/json",
          },
          method: "POST",
        },
      );
    });
    expect(await screen.findByText(/dataset activado/i)).toBeInTheDocument();
    expect(refreshMock).toHaveBeenCalled();
  });

  it("shows a non-sensitive reindex failure message", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ message: "request_id=req_secret" }), {
        status: 502,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    listDocumentsMock.mockResolvedValueOnce([createKnowledgeDocument()]);
    getOptionalAppSessionMock.mockResolvedValueOnce(createAppSession("expert"));

    await renderAdminKnowledgePage();
    fireEvent.click(
      screen.getByRole("button", {
        name: /reindexar corpus mvp botanico/i,
      }),
    );

    expect(
      await screen.findByText(/no se pudo completar el reindexado/i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/req_secret/i)).not.toBeInTheDocument();
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it("does not render reindex controls for retired or not-uploaded rows", async () => {
    listDocumentsMock.mockResolvedValueOnce([
      createKnowledgeDocument({
        docId: "not-uploaded",
        openAIFileId: null,
        status: "pending",
        title: "Documento pendiente",
      }),
      createKnowledgeDocument({
        docId: "retired-document",
        status: "retired",
        title: "Documento retirado",
      }),
    ]);
    getOptionalAppSessionMock.mockResolvedValueOnce(createAppSession("admin"));

    await renderAdminKnowledgePage();

    expect(
      screen.queryByRole("button", {
        name: /reindexar/i,
      }),
    ).not.toBeInTheDocument();
    expect(screen.getAllByText("No disponible")).toHaveLength(2);
  });

  it("renders a non-sensitive failure state when the catalog cannot be loaded", async () => {
    listDocumentsMock.mockRejectedValueOnce(
      new Error("database-secret-detail"),
    );
    getOptionalAppSessionMock.mockResolvedValueOnce(createAppSession("expert"));

    await renderAdminKnowledgePage();

    expect(
      screen.getByText(/no se pudo cargar el inventario documental/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/consulta del catalogo/i)).toBeInTheDocument();
    expect(
      screen.queryByText(/database-secret-detail/i),
    ).not.toBeInTheDocument();
  });
});
