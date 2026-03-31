import { describe, expect, it, vi } from "vitest";
import { OpenAIAdapterError } from "@/lib/openai/adapter-core";
import { createCreateChatResponse } from "./create-chat-response-core";

function createDeps() {
  const createConversationWithFirstUserMessage = vi.fn();
  const findConversationHistoryForUserById = vi.fn();
  const createResponse = vi.fn();
  const retrieveVectorStore = vi.fn();

  return {
    conversationStore: {
      createConversationWithFirstUserMessage,
      findConversationHistoryForUserById,
    },
    openAI: {
      createResponse,
      retrieveVectorStore,
    },
    spies: {
      createConversationWithFirstUserMessage,
      createResponse,
      findConversationHistoryForUserById,
      retrieveVectorStore,
    },
  };
}

function createReadyVectorStore() {
  return {
    file_counts: {
      cancelled: 0,
      completed: 1,
      failed: 0,
      in_progress: 0,
      total: 1,
    },
    id: "vs_active_123",
    status: "completed",
  };
}

describe("createCreateChatResponse", () => {
  it("creates a new conversation and sends the first user message to the model", async () => {
    const deps = createDeps();
    deps.spies.createConversationWithFirstUserMessage.mockResolvedValueOnce({
      conversationId: "conversation-1",
      createdAt: "2026-03-31T12:00:00.000Z",
      lastMessageAt: "2026-03-31T12:00:00.000Z",
      messageId: "message-1",
      status: "active",
      title: "Nueva consulta",
      updatedAt: "2026-03-31T12:00:00.000Z",
    });
    deps.spies.retrieveVectorStore.mockResolvedValueOnce(
      createReadyVectorStore(),
    );
    deps.spies.createResponse.mockResolvedValueOnce({
      id: "resp_123",
      output_text: "Respuesta inicial",
    });
    const createChatResponse = createCreateChatResponse({
      activeVectorStoreId: "vs_active_123",
      conversationStore: deps.conversationStore,
      model: "gpt-5-nano",
      openAI: deps.openAI,
    });

    const result = await createChatResponse({
      message: "  Consulta inicial  ",
      userId: "user-1",
    });

    expect(
      deps.spies.createConversationWithFirstUserMessage,
    ).toHaveBeenCalledWith({
      content: "Consulta inicial",
      userId: "user-1",
    });
    expect(
      deps.spies.findConversationHistoryForUserById,
    ).not.toHaveBeenCalled();
    expect(deps.spies.retrieveVectorStore).toHaveBeenCalledWith(
      "vs_active_123",
    );
    expect(deps.spies.createResponse).toHaveBeenCalledWith({
      include: ["file_search_call.results"],
      input: "Consulta inicial",
      model: "gpt-5-nano",
      store: false,
      tools: [
        {
          type: "file_search",
          vector_store_ids: ["vs_active_123"],
        },
      ],
    });
    expect(result).toEqual({
      citations: [],
      conversationId: "conversation-1",
      grounded: false,
      messageId: "resp_123",
      text: "Respuesta inicial",
    });
  });

  it("loads an existing conversation and includes its history in the model input", async () => {
    const deps = createDeps();
    deps.spies.findConversationHistoryForUserById.mockResolvedValueOnce({
      createdAt: "2026-03-31T12:00:00.000Z",
      id: "conversation-1",
      lastMessageAt: "2026-03-31T12:05:00.000Z",
      messages: [
        {
          content: "Mensaje previo del usuario",
          createdAt: "2026-03-31T12:00:00.000Z",
          id: "message-1",
          role: "user",
        },
        {
          content: "Respuesta previa del asistente",
          createdAt: "2026-03-31T12:01:00.000Z",
          id: "message-2",
          role: "assistant",
        },
      ],
      status: "active",
      title: "Consulta previa",
      updatedAt: "2026-03-31T12:05:00.000Z",
    });
    deps.spies.retrieveVectorStore.mockResolvedValueOnce(
      createReadyVectorStore(),
    );
    deps.spies.createResponse.mockResolvedValueOnce({
      id: "resp_456",
      output_text: "Seguimos con la consulta",
    });
    const createChatResponse = createCreateChatResponse({
      activeVectorStoreId: "vs_active_123",
      conversationStore: deps.conversationStore,
      model: "gpt-5-nano",
      openAI: deps.openAI,
    });

    const result = await createChatResponse({
      conversationId: "conversation-1",
      message: "Nueva pregunta",
      userId: "user-1",
    });

    expect(deps.spies.findConversationHistoryForUserById).toHaveBeenCalledWith(
      "user-1",
      "conversation-1",
    );
    expect(
      deps.spies.createConversationWithFirstUserMessage,
    ).not.toHaveBeenCalled();
    expect(deps.spies.createResponse).toHaveBeenCalledWith({
      include: ["file_search_call.results"],
      input: [
        "Conversation history:",
        "USER: Mensaje previo del usuario",
        "ASSISTANT: Respuesta previa del asistente",
        "",
        "USER: Nueva pregunta",
      ].join("\n"),
      model: "gpt-5-nano",
      store: false,
      tools: [
        {
          type: "file_search",
          vector_store_ids: ["vs_active_123"],
        },
      ],
    });
    expect(result).toEqual({
      citations: [],
      conversationId: "conversation-1",
      grounded: false,
      messageId: "resp_456",
      text: "Seguimos con la consulta",
    });
  });

  it("rejects missing or foreign conversations without exposing ownership details", async () => {
    const deps = createDeps();
    deps.spies.findConversationHistoryForUserById.mockResolvedValueOnce(null);
    const createChatResponse = createCreateChatResponse({
      activeVectorStoreId: "vs_active_123",
      conversationStore: deps.conversationStore,
      model: "gpt-5-nano",
      openAI: deps.openAI,
    });

    await expect(
      createChatResponse({
        conversationId: "conversation-1",
        message: "Nueva pregunta",
        userId: "user-1",
      }),
    ).rejects.toMatchObject({
      code: "conversation_not_found",
    });
    expect(deps.spies.createResponse).not.toHaveBeenCalled();
  });

  it("wraps OpenAI failures behind the temporary upstream error code", async () => {
    const deps = createDeps();
    deps.spies.createConversationWithFirstUserMessage.mockResolvedValueOnce({
      conversationId: "conversation-1",
      createdAt: "2026-03-31T12:00:00.000Z",
      lastMessageAt: "2026-03-31T12:00:00.000Z",
      messageId: "message-1",
      status: "active",
      title: "Nueva consulta",
      updatedAt: "2026-03-31T12:00:00.000Z",
    });
    deps.spies.retrieveVectorStore.mockResolvedValueOnce(
      createReadyVectorStore(),
    );
    deps.spies.createResponse.mockRejectedValueOnce(
      new OpenAIAdapterError({
        cause: new Error("provider failed"),
        code: "rate_limit_exceeded",
        message: "Rate limit exceeded.",
        requestId: "req_123",
        retryable: true,
        status: 429,
        type: "rate_limit_error",
      }),
    );
    const createChatResponse = createCreateChatResponse({
      activeVectorStoreId: "vs_active_123",
      conversationStore: deps.conversationStore,
      model: "gpt-5-nano",
      openAI: deps.openAI,
    });

    await expect(
      createChatResponse({
        message: "Consulta inicial",
        userId: "user-1",
      }),
    ).rejects.toMatchObject({
      code: "upstream_request_failed",
      message:
        "Rate limit exceeded. | request_id=req_123 | code=rate_limit_exceeded",
    });
  });

  it("fails before inference when the active vector store is not ready", async () => {
    const deps = createDeps();
    deps.spies.createConversationWithFirstUserMessage.mockResolvedValueOnce({
      conversationId: "conversation-1",
      createdAt: "2026-03-31T12:00:00.000Z",
      lastMessageAt: "2026-03-31T12:00:00.000Z",
      messageId: "message-1",
      status: "active",
      title: "Nueva consulta",
      updatedAt: "2026-03-31T12:00:00.000Z",
    });
    deps.spies.retrieveVectorStore.mockResolvedValueOnce({
      file_counts: {
        cancelled: 0,
        completed: 1,
        failed: 0,
        in_progress: 0,
        total: 1,
      },
      id: "vs_active_123",
      status: "in_progress",
    });
    const createChatResponse = createCreateChatResponse({
      activeVectorStoreId: "vs_active_123",
      conversationStore: deps.conversationStore,
      model: "gpt-5-nano",
      openAI: deps.openAI,
    });

    await expect(
      createChatResponse({
        message: "Consulta inicial",
        userId: "user-1",
      }),
    ).rejects.toMatchObject({
      code: "upstream_request_failed",
      message:
        "Active vector store vs_active_123 is not ready for chat retrieval: status=in_progress.",
    });
    expect(deps.spies.createResponse).not.toHaveBeenCalled();
  });

  it("fails before inference when the active vector store has no completed files", async () => {
    const deps = createDeps();
    deps.spies.createConversationWithFirstUserMessage.mockResolvedValueOnce({
      conversationId: "conversation-1",
      createdAt: "2026-03-31T12:00:00.000Z",
      lastMessageAt: "2026-03-31T12:00:00.000Z",
      messageId: "message-1",
      status: "active",
      title: "Nueva consulta",
      updatedAt: "2026-03-31T12:00:00.000Z",
    });
    deps.spies.retrieveVectorStore.mockResolvedValueOnce({
      file_counts: {
        cancelled: 0,
        completed: 0,
        failed: 1,
        in_progress: 0,
        total: 1,
      },
      id: "vs_active_123",
      status: "completed",
    });
    const createChatResponse = createCreateChatResponse({
      activeVectorStoreId: "vs_active_123",
      conversationStore: deps.conversationStore,
      model: "gpt-5-nano",
      openAI: deps.openAI,
    });

    await expect(
      createChatResponse({
        message: "Consulta inicial",
        userId: "user-1",
      }),
    ).rejects.toMatchObject({
      code: "upstream_request_failed",
      message:
        "Active vector store vs_active_123 does not contain any completed files for chat retrieval.",
    });
    expect(deps.spies.createResponse).not.toHaveBeenCalled();
  });
});
