import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppRole } from "@/lib/auth/roles";

const { getOptionalAppSessionMock, redirectMock } = vi.hoisted(() => ({
  getOptionalAppSessionMock: vi.fn(),
  redirectMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));

vi.mock("@/lib/auth/app-session", () => ({
  getOptionalAppSession: getOptionalAppSessionMock,
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

async function renderAdminKnowledgePage() {
  const { default: AdminKnowledgePage } = await import("./page");

  return render(await AdminKnowledgePage());
}

describe("AdminKnowledgePage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    redirectMock.mockImplementation((path: string) => {
      throw new Error(`REDIRECT:${path}`);
    });
  });

  it("redirects anonymous users to sign-in with the admin callback", async () => {
    getOptionalAppSessionMock.mockResolvedValueOnce(null);

    await expect(renderAdminKnowledgePage()).rejects.toThrow(
      "REDIRECT:/sign-in?callbackUrl=%2Fadmin%2Fknowledge",
    );
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
    },
  );
});
