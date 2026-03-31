import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ChatPageContent } from "./chat-page-content";

const fetchMock = vi.fn();
const routerPushMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: routerPushMock,
  }),
}));

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
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", fetchMock);
  });

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

  it("keeps the suggestion chips wired to the composer draft", () => {
    render(<ChatPageContent {...defaultProps} history={[]} />);

    fireEvent.click(
      screen.getByRole("button", {
        name: /cuidado de suculentas/i,
      }),
    );

    expect(
      screen.getByText("Formulario 4000 Cuidado de suculentas"),
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
                citations: [],
                id: "message-1",
                grounded: false,
                providerMessageId: null,
                role: "user",
                content: "Primer mensaje persistido",
                createdAt: "2026-03-19T12:05:00.000Z",
              },
              {
                citations: [],
                id: "message-2",
                grounded: false,
                providerMessageId: "resp_123",
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

  it("renders optimistic follow-ups and appends the assistant reply on success", async () => {
    let resolveFetch:
      | ((value: Response | PromiseLike<Response>) => void)
      | undefined;
    fetchMock.mockReturnValueOnce(
      new Promise<Response>((resolve) => {
        resolveFetch = resolve;
      }),
    );

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
                citations: [],
                id: "message-1",
                grounded: false,
                providerMessageId: null,
                role: "user",
                content: "Primer mensaje persistido",
                createdAt: "2026-03-19T12:05:00.000Z",
              },
            ],
          },
        ]}
      />,
    );

    const textarea = screen.getByRole("textbox", {
      name: /escribe tu duda aqui/i,
    });

    fireEvent.change(textarea, {
      target: {
        value: "Necesita mas agua",
      },
    });
    fireEvent.click(
      screen.getByRole("button", {
        name: /enviar mensaje/i,
      }),
    );

    expect(fetchMock).toHaveBeenCalledWith("/api/chat", {
      body: JSON.stringify({
        conversationId: "conversation-1",
        message: "Necesita mas agua",
      }),
      headers: {
        "content-type": "application/json",
      },
      method: "POST",
    });
    expect(screen.getByText("Necesita mas agua")).toBeInTheDocument();
    expect(screen.getByText("Enviando...")).toBeInTheDocument();
    expect(textarea).toHaveValue("");

    resolveFetch?.(
      new Response(
        JSON.stringify({
          citations: [],
          conversationId: "conversation-1",
          grounded: false,
          messageId: "assistant-message-1",
          text: "Respuesta transitoria del asistente",
        }),
        {
          headers: {
            "content-type": "application/json",
          },
          status: 200,
        },
      ),
    );

    await waitFor(() => {
      expect(
        screen.getByText("Respuesta transitoria del asistente"),
      ).toBeInTheDocument();
    });

    expect(screen.queryByText("Enviando...")).not.toBeInTheDocument();
    expect(screen.getByText("3 mensajes")).toBeInTheDocument();
  });

  it("shows an error state and retries the same follow-up payload", async () => {
    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            message: "Upstream chat request failed.",
          }),
          {
            headers: {
              "content-type": "application/json",
            },
            status: 502,
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            citations: [],
            conversationId: "conversation-1",
            grounded: false,
            messageId: "assistant-message-2",
            text: "Respuesta tras reintento",
          }),
          {
            headers: {
              "content-type": "application/json",
            },
            status: 200,
          },
        ),
      );

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
                citations: [],
                id: "message-1",
                grounded: false,
                providerMessageId: null,
                role: "user",
                content: "Primer mensaje persistido",
                createdAt: "2026-03-19T12:05:00.000Z",
              },
            ],
          },
        ]}
      />,
    );

    fireEvent.change(screen.getByRole("textbox"), {
      target: {
        value: "Seguimiento con error",
      },
    });
    fireEvent.click(
      screen.getByRole("button", {
        name: /enviar mensaje/i,
      }),
    );

    await waitFor(() => {
      expect(
        screen.getByText("Upstream chat request failed."),
      ).toBeInTheDocument();
    });

    fireEvent.click(
      screen.getByRole("button", {
        name: /reintentar/i,
      }),
    );

    await waitFor(() => {
      expect(screen.getByText("Respuesta tras reintento")).toBeInTheDocument();
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]?.[1]).toEqual(fetchMock.mock.calls[1]?.[1]);
  });

  it("redirects to sign-in when the follow-up request returns 401", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          message: "Not authenticated",
        }),
        {
          headers: {
            "content-type": "application/json",
          },
          status: 401,
        },
      ),
    );

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
                citations: [],
                id: "message-1",
                grounded: false,
                providerMessageId: null,
                role: "user",
                content: "Primer mensaje persistido",
                createdAt: "2026-03-19T12:05:00.000Z",
              },
            ],
          },
        ]}
      />,
    );

    fireEvent.change(screen.getByRole("textbox"), {
      target: {
        value: "Necesita redirigir",
      },
    });
    fireEvent.click(
      screen.getByRole("button", {
        name: /enviar mensaje/i,
      }),
    );

    await waitFor(() => {
      expect(routerPushMock).toHaveBeenCalledWith(
        "/sign-in?callbackUrl=%2Fchat%3Fconversation%3Dconversation-1",
      );
    });
  });
});
