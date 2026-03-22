import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ChatPageContent } from "./chat-page-content";

vi.mock("./create-conversation-form", () => ({
  CreateConversationForm: ({
    message,
    maxMessageChars,
  }: {
    message: string;
    onMessageChange: (message: string) => void;
    maxMessageChars: number;
  }) => (
    <div>
      Formulario {maxMessageChars} {message}
    </div>
  ),
}));

vi.mock("@/components/auth/sign-out-form", () => ({
  SignOutForm: ({ label = "Cerrar sesion" }: { label?: string }) => (
    <button type="button">{label}</button>
  ),
}));

const defaultProps = {
  composer: {
    maxMessageChars: 4000,
  },
  selectedConversationId: null,
  user: {
    id: "google:sub_123",
    email: "admin@example.com",
    name: "Admin User",
    role: "admin" as const,
  },
};

describe("ChatPageContent", () => {
  it("renders the empty history state", () => {
    render(<ChatPageContent {...defaultProps} history={[]} />);

    expect(
      screen.getByRole("heading", {
        name: /planta te gustaria conocer hoy/i,
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("Formulario 4000")).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: /cuidado de suculentas/i,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/aun no hay consultas guardadas/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/starter tier|expert tier|admin tier/i),
    ).toBeInTheDocument();
  });

  it("renders the selected persisted conversation from SSR history", () => {
    render(
      <ChatPageContent
        {...defaultProps}
        selectedConversationId="conversation-1"
        history={[
          {
            id: "conversation-1",
            title: "Consulta inicial",
            status: "active",
            createdAt: "2026-03-19T12:00:00.000Z",
            updatedAt: "2026-03-19T12:00:00.000Z",
            lastMessageAt: "2026-03-19T12:05:00.000Z",
            messages: [
              {
                id: "message-1",
                role: "user",
                content: "Primer mensaje persistido",
                createdAt: "2026-03-19T12:05:00.000Z",
              },
              {
                id: "message-2",
                role: "assistant",
                content: "Respuesta ya leida desde SSR",
                createdAt: "2026-03-19T12:06:00.000Z",
              },
            ],
          },
        ]}
      />,
    );

    expect(
      screen.getByRole("heading", {
        name: /consulta inicial/i,
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("Primer mensaje persistido")).toBeInTheDocument();
    expect(
      screen.getByText("Respuesta ya leida desde SSR"),
    ).toBeInTheDocument();
    expect(screen.getByText("2 mensajes")).toBeInTheDocument();
    expect(
      screen.getByRole("link", {
        name: /consulta inicial/i,
      }),
    ).toHaveAttribute("aria-current", "page");
  });

  it("renders a not-found state when the selected conversation id is missing", () => {
    render(
      <ChatPageContent
        {...defaultProps}
        selectedConversationId="missing"
        history={[]}
      />,
    );

    expect(
      screen.getByRole("heading", {
        name: /esta consulta ya no esta disponible en tu historial/i,
      }),
    ).toBeInTheDocument();
  });
});
