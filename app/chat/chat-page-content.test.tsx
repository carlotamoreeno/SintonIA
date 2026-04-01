import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ChatPageContent,
  truncateSidebarConversationLabel,
} from "./chat-page-content";

const fetchMock = vi.fn();
const routerPushMock = vi.fn();
const routerReplaceMock = vi.fn();
const sampleCitation = {
  documentId: "doc-1",
  documentName: "Guia de riego",
  fileId: "file-1",
  snippet:
    "Riega solo cuando el sustrato este seco en los primeros centimetros.",
  vectorStoreId: "vs-1",
};

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: routerPushMock,
    replace: routerReplaceMock,
  }),
}));

vi.mock("@/components/auth/sign-out-form", () => ({
  SignOutForm: ({ label = "Cerrar sesion" }: { label?: string }) => (
    <button type="button">{label}</button>
  ),
}));

function createSseResponse(events: string[], status = 200) {
  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(events.join("\n\n")));
      controller.close();
    },
  });

  return new Response(body, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
    },
    status,
  });
}

function createControlledSseResponse() {
  let controller: ReadableStreamDefaultController<Uint8Array> | null = null;

  const response = new Response(
    new ReadableStream({
      start(nextController) {
        controller = nextController;
      },
    }),
    {
      headers: {
        "content-type": "text/event-stream; charset=utf-8",
      },
      status: 200,
    },
  );

  return {
    close() {
      controller?.close();
    },
    push(event: string) {
      controller?.enqueue(new TextEncoder().encode(`${event}\n\n`));
    },
    response,
  };
}

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
      screen.getByRole("textbox", {
        name: /escribe tu duda aqui/i,
      }),
    ).toHaveValue("Cuidado de suculentas");
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
    expect(screen.getByText("Sin respaldo documental")).toBeInTheDocument();
    expect(screen.getByText("2 mensajes")).toBeInTheDocument();
    expect(
      screen.getByRole("link", {
        name: /consulta inicial/i,
      }),
    ).toHaveAttribute("aria-current", "page");
    expect(screen.queryByText("Fuentes")).not.toBeInTheDocument();
  });

  it("truncates long conversation titles in the sidebar without losing the full tooltip", () => {
    const longTitle =
      "¿Eres Chat GPT? ¿Estás actualmente recomendando un plan de riego demasiado largo para el sidebar?";

    render(
      <ChatPageContent
        {...defaultProps}
        selectedConversationId="conversation-1"
        history={[
          {
            id: "conversation-1",
            title: longTitle,
            status: "active",
            createdAt: "2026-03-19T12:00:00.000Z",
            updatedAt: "2026-03-19T12:00:00.000Z",
            lastMessageAt: "2026-03-19T12:05:00.000Z",
            messages: [],
          },
        ]}
      />,
    );

    const sidebarLink = screen.getByRole("link", {
      name: truncateSidebarConversationLabel(longTitle),
    });

    expect(sidebarLink).toHaveAttribute("title", longTitle);
    expect(sidebarLink).toHaveTextContent(
      truncateSidebarConversationLabel(longTitle),
    );
  });

  it("renders visible citations for persisted assistant messages from SSR history", () => {
    render(
      <ChatPageContent
        {...defaultProps}
        selectedConversationId="conversation-1"
        history={[
          {
            id: "conversation-1",
            title: "Consulta con fuentes",
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
                content: "Como riego esta planta",
                createdAt: "2026-03-19T12:05:00.000Z",
              },
              {
                citations: [sampleCitation],
                id: "message-2",
                grounded: true,
                providerMessageId: "resp_123",
                role: "assistant",
                content: "Puedes regarla de forma moderada.",
                createdAt: "2026-03-19T12:06:00.000Z",
              },
            ],
          },
        ]}
      />,
    );

    expect(screen.getByText("Fuentes")).toBeInTheDocument();
    expect(screen.getByText("Con respaldo documental")).toBeInTheDocument();
    expect(screen.getByText(sampleCitation.documentName)).toBeInTheDocument();
    expect(screen.getByText(sampleCitation.snippet)).toBeInTheDocument();
  });

  it("renders long citation snippets with normalized paragraphs and bullet lists", () => {
    const richCitation = {
      ...sampleCitation,
      snippet:
        "Cómo decidir si toca regar  La decisión correcta combina cuatro capas de información.  ● Vaciar plato o cubremaceta: El agua retenida bajo la maceta prolonga el encharcamiento.  ● A más luz y calor, más consumo: Una planta en ventana muy luminosa secará antes.  ● A menos luz y en invierno, menos riego: La demanda de agua también cae.",
    };

    render(
      <ChatPageContent
        {...defaultProps}
        selectedConversationId="conversation-1"
        history={[
          {
            id: "conversation-1",
            title: "Consulta con snippet largo",
            status: "active",
            createdAt: "2026-03-19T12:00:00.000Z",
            updatedAt: "2026-03-19T12:00:00.000Z",
            lastMessageAt: "2026-03-19T12:05:00.000Z",
            messages: [
              {
                citations: [richCitation],
                id: "message-2",
                grounded: true,
                providerMessageId: "resp_123",
                role: "assistant",
                content: "Te ajusto una pauta más precisa.",
                createdAt: "2026-03-19T12:06:00.000Z",
              },
            ],
          },
        ]}
      />,
    );

    const sourceCard = screen
      .getByText(richCitation.documentName)
      .closest("li");

    expect(sourceCard).not.toBeNull();
    expect(
      within(sourceCard as HTMLElement).getByText(
        /Cómo decidir si toca regar La decisión correcta combina cuatro capas de información\./i,
      ),
    ).toBeInTheDocument();
    expect(
      within(sourceCard as HTMLElement).getAllByRole("listitem"),
    ).toHaveLength(3);
    expect(
      within(sourceCard as HTMLElement).getByText(
        /Vaciar plato o cubremaceta/i,
      ),
    ).toBeInTheDocument();
    expect(
      within(sourceCard as HTMLElement).getByText(
        /A menos luz y en invierno, menos riego/i,
      ),
    ).toBeInTheDocument();
  });

  it("renders fragment-only citation snippets as a readable bullet list with a detected heading", () => {
    const fragmentedCitation = {
      ...sampleCitation,
      snippet: [
        "el riesgo de raíces sin oxígeno.",
        "barro, secará antes que otra igual en un rincón oscuro.",
        "también cae, incluso si la costumbre del cuidador no cambia.",
        "regarse con la misma lógica.",
        "contenedor o la mezcla retienen demasiada agua.",
        "Cómo decidir si toca regar",
        "La decisión correcta combina cuatro capas de información. Primera: el grupo de planta. Las plantas.",
      ].join("\n"),
    };

    render(
      <ChatPageContent
        {...defaultProps}
        selectedConversationId="conversation-1"
        history={[
          {
            id: "conversation-1",
            title: "Consulta con snippet fragmentado",
            status: "active",
            createdAt: "2026-03-19T12:00:00.000Z",
            updatedAt: "2026-03-19T12:00:00.000Z",
            lastMessageAt: "2026-03-19T12:05:00.000Z",
            messages: [
              {
                citations: [fragmentedCitation],
                id: "message-2",
                grounded: true,
                providerMessageId: "resp_123",
                role: "assistant",
                content: "Te ajusto una pauta más precisa.",
                createdAt: "2026-03-19T12:06:00.000Z",
              },
            ],
          },
        ]}
      />,
    );

    const sourceCard = screen
      .getByText(fragmentedCitation.documentName)
      .closest("li");

    expect(sourceCard).not.toBeNull();
    expect(
      within(sourceCard as HTMLElement).getByText("Cómo decidir si toca regar"),
    ).toBeInTheDocument();
    expect(
      within(sourceCard as HTMLElement).getAllByRole("listitem"),
    ).toHaveLength(5);
    expect(
      within(sourceCard as HTMLElement).getByText(
        "...el riesgo de raíces sin oxígeno.",
      ),
    ).toBeInTheDocument();
    expect(
      within(sourceCard as HTMLElement).getByText(
        /La decisión correcta combina cuatro capas de información/i,
      ),
    ).toBeInTheDocument();
  });

  it("renders lightweight markdown for assistant SSR messages and keeps citations separate", () => {
    render(
      <ChatPageContent
        {...defaultProps}
        selectedConversationId="conversation-1"
        history={[
          {
            id: "conversation-1",
            title: "Consulta con formato",
            status: "active",
            createdAt: "2026-03-19T12:00:00.000Z",
            updatedAt: "2026-03-19T12:00:00.000Z",
            lastMessageAt: "2026-03-19T12:05:00.000Z",
            messages: [
              {
                citations: [sampleCitation],
                id: "message-2",
                grounded: true,
                providerMessageId: "resp_123",
                role: "assistant",
                content: [
                  "Resumen con **punto clave**.",
                  "",
                  "- Primer paso",
                  "- Segundo paso",
                ].join("\n"),
                createdAt: "2026-03-19T12:06:00.000Z",
              },
            ],
          },
        ]}
      />,
    );

    const strong = screen.getByText("punto clave", {
      selector: "strong",
    });
    const article = strong.closest("article");
    const bodyList = screen.getByText("Primer paso").closest("ul");

    expect(strong).toBeInTheDocument();
    expect(article).not.toBeNull();
    expect(bodyList).not.toBeNull();
    expect(
      within(bodyList as HTMLElement).getAllByRole("listitem"),
    ).toHaveLength(2);
    expect(
      within(article as HTMLElement).getByText(sampleCitation.documentName),
    ).toBeInTheDocument();
    expect(
      within(article as HTMLElement).getByText(sampleCitation.snippet),
    ).toBeInTheDocument();
  });

  it("hides historical provider citation artifacts in persisted assistant messages", () => {
    render(
      <ChatPageContent
        {...defaultProps}
        selectedConversationId="conversation-1"
        history={[
          {
            id: "conversation-1",
            title: "Consulta con artefactos",
            status: "active",
            createdAt: "2026-03-19T12:00:00.000Z",
            updatedAt: "2026-03-19T12:00:00.000Z",
            lastMessageAt: "2026-03-19T12:05:00.000Z",
            messages: [
              {
                citations: [],
                id: "message-2",
                grounded: false,
                providerMessageId: "resp_123",
                role: "assistant",
                content:
                  "Riego y estado general. fileciteturn0file8turn0file9",
                createdAt: "2026-03-19T12:06:00.000Z",
              },
            ],
          },
        ]}
      />,
    );

    expect(screen.getByText("Riego y estado general.")).toBeInTheDocument();
    expect(screen.queryByText(/filecite/i)).toBeNull();
  });

  it("does not render a citation block for user messages or assistant messages without citations", () => {
    render(
      <ChatPageContent
        {...defaultProps}
        selectedConversationId="conversation-1"
        history={[
          {
            id: "conversation-1",
            title: "Consulta sin fuentes visibles",
            status: "active",
            createdAt: "2026-03-19T12:00:00.000Z",
            updatedAt: "2026-03-19T12:00:00.000Z",
            lastMessageAt: "2026-03-19T12:05:00.000Z",
            messages: [
              {
                citations: [sampleCitation],
                id: "message-1",
                grounded: true,
                providerMessageId: null,
                role: "user",
                content: "Mensaje de usuario con datos no validos para la UI",
                createdAt: "2026-03-19T12:05:00.000Z",
              },
              {
                citations: [],
                id: "message-2",
                grounded: false,
                providerMessageId: "resp_123",
                role: "assistant",
                content: "Respuesta sin citas",
                createdAt: "2026-03-19T12:06:00.000Z",
              },
            ],
          },
        ]}
      />,
    );

    expect(screen.queryByText("Fuentes")).not.toBeInTheDocument();
    expect(
      screen.queryByText(sampleCitation.documentName),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(sampleCitation.snippet)).not.toBeInTheDocument();
    expect(screen.getByText("Sin respaldo documental")).toBeInTheDocument();
    expect(
      screen.queryByText("Con respaldo documental"),
    ).not.toBeInTheDocument();
  });

  it("does not render the grounding badge for user messages even if the data is invalid", () => {
    render(
      <ChatPageContent
        {...defaultProps}
        selectedConversationId="conversation-1"
        history={[
          {
            id: "conversation-1",
            title: "Consulta sin badge en usuario",
            status: "active",
            createdAt: "2026-03-19T12:00:00.000Z",
            updatedAt: "2026-03-19T12:00:00.000Z",
            lastMessageAt: "2026-03-19T12:05:00.000Z",
            messages: [
              {
                citations: [sampleCitation],
                id: "message-1",
                grounded: true,
                providerMessageId: null,
                role: "user",
                content: "Mensaje del usuario",
                createdAt: "2026-03-19T12:05:00.000Z",
              },
            ],
          },
        ]}
      />,
    );

    expect(
      screen.queryByText("Con respaldo documental"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("Sin respaldo documental"),
    ).not.toBeInTheDocument();
  });

  it("keeps markdown markers literal for user messages", () => {
    render(
      <ChatPageContent
        {...defaultProps}
        selectedConversationId="conversation-1"
        history={[
          {
            id: "conversation-1",
            title: "Consulta del usuario",
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
                content: "No conviertas **esto** en negrita.",
                createdAt: "2026-03-19T12:05:00.000Z",
              },
            ],
          },
        ]}
      />,
    );

    expect(
      screen.getByText("No conviertas **esto** en negrita."),
    ).toBeInTheDocument();
    expect(screen.queryByText("esto", { selector: "strong" })).toBeNull();
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
        accept: "text/event-stream",
        "content-type": "application/json",
      },
      method: "POST",
    });
    expect(screen.getByText("Necesita mas agua")).toBeInTheDocument();
    expect(screen.getByText("Preparando respuesta…")).toBeInTheDocument();
    expect(
      screen.queryByText("Con respaldo documental"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("Sin respaldo documental"),
    ).not.toBeInTheDocument();
    expect(textarea).toHaveValue("");

    resolveFetch?.(
      createSseResponse([
        'event: conversation\ndata: {"type":"conversation","conversationId":"conversation-1"}',
        'event: assistant_delta\ndata: {"type":"assistant_delta","delta":"Respuesta transitoria"}',
        `event: done\ndata: ${JSON.stringify({
          citations: [sampleCitation],
          conversationId: "conversation-1",
          grounded: true,
          messageId: "assistant-message-1",
          text: "Respuesta transitoria del asistente",
          type: "done",
        })}`,
      ]),
    );

    await waitFor(() => {
      expect(
        screen.getByText("Respuesta transitoria del asistente"),
      ).toBeInTheDocument();
    });

    expect(screen.getByText("Fuentes")).toBeInTheDocument();
    expect(screen.getByText("Con respaldo documental")).toBeInTheDocument();
    expect(screen.getByText(sampleCitation.documentName)).toBeInTheDocument();
    expect(screen.getByText(sampleCitation.snippet)).toBeInTheDocument();
    expect(screen.queryByText("Preparando respuesta…")).not.toBeInTheDocument();
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
        createSseResponse([
          'event: conversation\ndata: {"type":"conversation","conversationId":"conversation-1"}',
          'event: assistant_delta\ndata: {"type":"assistant_delta","delta":"Respuesta tras"}',
          `event: done\ndata: ${JSON.stringify({
            citations: [],
            conversationId: "conversation-1",
            grounded: false,
            messageId: "assistant-message-2",
            text: "Respuesta tras reintento",
            type: "done",
          })}`,
        ]),
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
    expect(fetchMock.mock.calls[0]?.[1]).toEqual({
      body: JSON.stringify({
        conversationId: "conversation-1",
        message: "Seguimiento con error",
      }),
      headers: {
        accept: "text/event-stream",
        "content-type": "application/json",
      },
      method: "POST",
    });
    expect(fetchMock.mock.calls[1]?.[1]).toEqual({
      body: JSON.stringify({
        conversationId: "conversation-1",
        message: "Seguimiento con error",
      }),
      headers: {
        accept: "text/event-stream",
        "content-type": "application/json",
      },
      method: "POST",
    });
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

  it("streams the first turn from the empty state and updates the URL once the real conversation id arrives", async () => {
    let resolveFetch:
      | ((value: Response | PromiseLike<Response>) => void)
      | undefined;
    fetchMock.mockReturnValueOnce(
      new Promise<Response>((resolve) => {
        resolveFetch = resolve;
      }),
    );

    render(<ChatPageContent {...defaultProps} history={[]} />);

    fireEvent.change(
      screen.getByRole("textbox", {
        name: /escribe tu duda aqui/i,
      }),
      {
        target: {
          value: "Necesito ayuda con mis rosales",
        },
      },
    );
    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", {
          name: /crear conversacion/i,
        }),
      );
    });

    expect(
      screen.getByRole("heading", {
        name: "Necesito ayuda con mis rosales",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("Preparando respuesta…")).toBeInTheDocument();

    resolveFetch?.(
      createSseResponse([
        'event: conversation\ndata: {"type":"conversation","conversationId":"conversation-1"}',
        'event: assistant_delta\ndata: {"type":"assistant_delta","delta":"Hola, te ayudo con eso."}',
        `event: done\ndata: ${JSON.stringify({
          citations: [],
          conversationId: "conversation-1",
          grounded: false,
          messageId: "resp_123",
          text: "Hola, te ayudo con eso.",
          type: "done",
        })}`,
      ]),
    );

    await waitFor(() => {
      expect(screen.getByText("Hola, te ayudo con eso.")).toBeInTheDocument();
    });

    expect(routerReplaceMock).toHaveBeenCalledWith(
      "/chat?conversation=conversation-1",
    );
  });

  it("renders lightweight markdown while assistant deltas stream in", async () => {
    const controlledStream = createControlledSseResponse();
    fetchMock.mockResolvedValueOnce(controlledStream.response);

    render(<ChatPageContent {...defaultProps} history={[]} />);

    fireEvent.change(
      screen.getByRole("textbox", {
        name: /escribe tu duda aqui/i,
      }),
      {
        target: {
          value: "Ordena el riego",
        },
      },
    );

    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", {
          name: /crear conversacion/i,
        }),
      );
    });

    await act(async () => {
      controlledStream.push(
        'event: conversation\ndata: {"type":"conversation","conversationId":"conversation-1"}',
      );
      controlledStream.push(
        'event: assistant_delta\ndata: {"type":"assistant_delta","delta":"**Riego"}',
      );
    });

    await waitFor(() => {
      expect(screen.getByText("**Riego")).toBeInTheDocument();
    });
    expect(screen.queryByText("Riego", { selector: "strong" })).toBeNull();
    expect(
      screen.queryByText("Con respaldo documental"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("Sin respaldo documental"),
    ).not.toBeInTheDocument();

    await act(async () => {
      controlledStream.push(
        'event: assistant_delta\ndata: {"type":"assistant_delta","delta":" moderado**\\n\\n- Paso 1"}',
      );
    });

    await waitFor(() => {
      expect(
        screen.getByText("Riego moderado", {
          selector: "strong",
        }),
      ).toBeInTheDocument();
    });
    expect(screen.getByRole("list")).toBeInTheDocument();
    expect(screen.queryByText("**Riego moderado**")).not.toBeInTheDocument();

    await act(async () => {
      controlledStream.push(
        `event: done\ndata: ${JSON.stringify({
          citations: [],
          conversationId: "conversation-1",
          grounded: false,
          messageId: "assistant-message-1",
          text: "**Riego moderado**\n\n- Paso 1",
          type: "done",
        })}`,
      );
      controlledStream.close();
    });

    await waitFor(() => {
      expect(
        screen.getByText("Riego moderado", {
          selector: "strong",
        }),
      ).toBeInTheDocument();
    });
    expect(screen.getByText("Sin respaldo documental")).toBeInTheDocument();
  });

  it("switches the visible conversation immediately when clicking another item in the sidebar", async () => {
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
                content: "Contenido de la primera conversación",
                createdAt: "2026-03-19T12:05:00.000Z",
              },
            ],
          },
          {
            id: "conversation-2",
            title: "Segunda consulta",
            status: "active",
            createdAt: "2026-03-19T13:00:00.000Z",
            updatedAt: "2026-03-19T13:00:00.000Z",
            lastMessageAt: "2026-03-19T13:05:00.000Z",
            messages: [
              {
                citations: [],
                id: "message-2",
                grounded: false,
                providerMessageId: null,
                role: "user",
                content: "Contenido de la segunda conversación",
                createdAt: "2026-03-19T13:05:00.000Z",
              },
            ],
          },
        ]}
      />,
    );

    fireEvent.click(
      screen.getByRole("link", {
        name: /segunda consulta/i,
      }),
    );

    expect(
      screen.getByText("Contenido de la segunda conversación"),
    ).toBeInTheDocument();
    expect(routerPushMock).toHaveBeenCalledWith(
      "/chat?conversation=conversation-2",
    );
  });

  it("clears the current conversation immediately when clicking New Chat", () => {
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
                content: "Contenido de la primera conversación",
                createdAt: "2026-03-19T12:05:00.000Z",
              },
            ],
          },
        ]}
      />,
    );

    fireEvent.click(
      screen.getByRole("link", {
        name: /new chat/i,
      }),
    );

    expect(
      screen.getByRole("heading", {
        name: /planta te gustaria conocer hoy/i,
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Contenido de la primera conversación"),
    ).not.toBeInTheDocument();
    expect(routerReplaceMock).toHaveBeenCalledWith("/chat");
  });
});
