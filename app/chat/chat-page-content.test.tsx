import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ChatPageContent } from "./chat-page-content";

describe("ChatPageContent", () => {
  it("renders the authenticated placeholder state", () => {
    render(
      <ChatPageContent
        signOutControl={<button type="button">Cerrar sesion</button>}
        user={{
          id: "google:sub_123",
          email: "admin@example.com",
          name: "Admin User",
          role: "admin",
        }}
      />,
    );

    expect(
      screen.getByRole("heading", {
        name: /el acceso autenticado ya protege la futura experiencia de chat/i,
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("admin")).toBeInTheDocument();
    expect(screen.getByText("google:sub_123")).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: /cerrar sesion/i,
      }),
    ).toBeInTheDocument();
  });
});
