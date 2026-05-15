import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DocumentUploadForm } from "./document-upload-form";

const { refreshMock } = vi.hoisted(() => ({
  refreshMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: refreshMock,
  }),
}));

function fillUploadForm() {
  fireEvent.change(screen.getByLabelText(/dataset/i), {
    target: {
      value: "mvp-2026-03",
    },
  });
  fireEvent.change(screen.getByLabelText(/doc id/i), {
    target: {
      value: "orchid-care",
    },
  });
  fireEvent.change(screen.getByLabelText(/titulo/i), {
    target: {
      value: "Guia botanica",
    },
  });
  fireEvent.change(screen.getByLabelText(/version/i), {
    target: {
      value: "2",
    },
  });
  fireEvent.change(screen.getByLabelText(/pdf/i), {
    target: {
      files: [
        new File(["%PDF-1.4\nT-56\n%%EOF"], "orchid-care.pdf", {
          type: "application/pdf",
        }),
      ],
    },
  });
}

describe("DocumentUploadForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts form data and refreshes the inventory after a successful upload", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          document: {
            status: "ready",
          },
        }),
        {
          status: 201,
        },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<DocumentUploadForm />);
    fillUploadForm();
    fireEvent.submit(screen.getByRole("form", { name: /subida documental/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/admin/knowledge/documents", {
        body: expect.any(FormData),
        method: "POST",
      });
    });
    expect(
      await screen.findByText(/documento subido e indexado/i),
    ).toBeInTheDocument();
    expect(refreshMock).toHaveBeenCalled();
  });

  it("shows a non-sensitive conflict message when the upload is rejected", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ message: "duplicate-secret-detail" }), {
        status: 409,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<DocumentUploadForm />);
    fillUploadForm();
    fireEvent.submit(screen.getByRole("form", { name: /subida documental/i }));

    expect(
      await screen.findByText(/ya existe un documento/i),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/duplicate-secret-detail/i),
    ).not.toBeInTheDocument();
    expect(refreshMock).not.toHaveBeenCalled();
  });
});
