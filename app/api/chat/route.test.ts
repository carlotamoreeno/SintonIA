import { describe, expect, it, vi } from "vitest";
import { UNAUTHENTICATED_API_MESSAGE } from "@/lib/auth/access";
import {
  INVALID_CHAT_REQUEST_MESSAGE,
  UPSTREAM_CHAT_ERROR_MESSAGE,
} from "@/lib/chat/chat-route";

const getOptionalAppSessionMock = vi.fn();
const createChatResponseMock = vi.fn();

vi.mock("@/lib/auth/app-session", () => ({
  getOptionalAppSession: getOptionalAppSessionMock,
}));

vi.mock("@/lib/chat/create-chat-response", () => ({
  CreateChatResponseError: class CreateChatResponseError extends Error {
    readonly code: string;

    constructor(input: { code: string; message: string }) {
      super(input.message);
      this.code = input.code;
    }
  },
  createChatResponse: createChatResponseMock,
}));

function createJsonRequest(body: unknown) {
  return new Request("http://localhost:3000/api/chat", {
    body: JSON.stringify(body),
    headers: {
      "content-type": "application/json",
    },
    method: "POST",
  });
}

describe("POST /api/chat", () => {
  it("returns 401 when there is no authenticated session", async () => {
    getOptionalAppSessionMock.mockResolvedValueOnce(null);

    const { POST } = await import("./route");
    const response = await POST(createJsonRequest({ message: "Hola" }));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      message: UNAUTHENTICATED_API_MESSAGE,
    });
    expect(createChatResponseMock).not.toHaveBeenCalled();
  });

  it("returns 400 when the message is empty after trimming", async () => {
    getOptionalAppSessionMock.mockResolvedValueOnce({
      persistedIdentity: {
        user: {
          id: "user-1",
        },
      },
      session: {
        user: {
          id: "google:sub_123",
        },
      },
    });

    const { POST } = await import("./route");
    const response = await POST(createJsonRequest({ message: "   " }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      message: INVALID_CHAT_REQUEST_MESSAGE,
      issues: {
        conversationId: undefined,
        message: ["Message must not be empty."],
      },
    });
    expect(createChatResponseMock).not.toHaveBeenCalled();
  });

  it("returns 400 when the message exceeds the contract limit", async () => {
    getOptionalAppSessionMock.mockResolvedValueOnce({
      persistedIdentity: {
        user: {
          id: "user-1",
        },
      },
      session: {
        user: {
          id: "google:sub_123",
        },
      },
    });

    const { POST } = await import("./route");
    const response = await POST(
      createJsonRequest({
        message: "x".repeat(4001),
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      message: INVALID_CHAT_REQUEST_MESSAGE,
      issues: {
        conversationId: undefined,
        message: ["Message must not exceed 4000 characters."],
      },
    });
    expect(createChatResponseMock).not.toHaveBeenCalled();
  });

  it("returns 400 when the conversationId is blank after trimming", async () => {
    getOptionalAppSessionMock.mockResolvedValueOnce({
      persistedIdentity: {
        user: {
          id: "user-1",
        },
      },
      session: {
        user: {
          id: "google:sub_123",
        },
      },
    });

    const { POST } = await import("./route");
    const response = await POST(
      createJsonRequest({
        conversationId: "   ",
        message: "Consulta valida",
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      message: INVALID_CHAT_REQUEST_MESSAGE,
      issues: {
        conversationId: ["ConversationId must not be empty."],
        message: undefined,
      },
    });
    expect(createChatResponseMock).not.toHaveBeenCalled();
  });

  it("delegates valid payloads to the chat service with trimmed values", async () => {
    getOptionalAppSessionMock.mockResolvedValueOnce({
      persistedIdentity: {
        user: {
          id: "user-1",
        },
      },
      session: {
        user: {
          id: "google:sub_123",
        },
      },
    });
    createChatResponseMock.mockResolvedValueOnce({
      citations: [],
      conversationId: "conversation-1",
      grounded: false,
      messageId: "message-1",
      text: "Respuesta inicial",
    });

    const { POST } = await import("./route");
    const response = await POST(
      createJsonRequest({
        conversationId: "  conversation-1  ",
        message: "  Consulta valida  ",
      }),
    );

    expect(createChatResponseMock).toHaveBeenCalledWith({
      conversationId: "conversation-1",
      message: "Consulta valida",
      userId: "user-1",
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      citations: [],
      conversationId: "conversation-1",
      grounded: false,
      messageId: "message-1",
      text: "Respuesta inicial",
    });
  });

  it("maps missing or foreign conversations to a generic 400 conversationId issue", async () => {
    getOptionalAppSessionMock.mockResolvedValueOnce({
      persistedIdentity: {
        user: {
          id: "user-1",
        },
      },
      session: {
        user: {
          id: "google:sub_123",
        },
      },
    });
    const { CreateChatResponseError } =
      await import("@/lib/chat/create-chat-response");
    createChatResponseMock.mockRejectedValueOnce(
      new CreateChatResponseError({
        code: "conversation_not_found",
        message: "Conversation not found.",
      }),
    );

    const { POST } = await import("./route");
    const response = await POST(
      createJsonRequest({
        conversationId: "conversation-1",
        message: "Consulta valida",
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      message: INVALID_CHAT_REQUEST_MESSAGE,
      issues: {
        conversationId: ["Invalid conversationId."],
      },
    });
  });

  it("returns a temporary generic 502 envelope for runtime failures", async () => {
    getOptionalAppSessionMock.mockResolvedValueOnce({
      persistedIdentity: {
        user: {
          id: "user-1",
        },
      },
      session: {
        user: {
          id: "google:sub_123",
        },
      },
    });
    createChatResponseMock.mockRejectedValueOnce(new Error("provider failed"));

    const { POST } = await import("./route");
    const response = await POST(createJsonRequest({ message: "Hola" }));

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({
      message: UPSTREAM_CHAT_ERROR_MESSAGE,
    });
  });
});
