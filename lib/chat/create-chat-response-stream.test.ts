import { describe, expect, it, vi } from "vitest";
import { createCreateChatResponseStream } from "./create-chat-response-stream-core";

function createDeps() {
  const persistAssistantMessageWithCitations = vi.fn();
  const persistConversationTurnWithCitations = vi.fn();
  const createConversationWithFirstUserMessage = vi.fn();
  const findConversationHistoryForUserById = vi.fn();
  const findDocumentByIdentity = vi.fn();
  const retrieveVectorStore = vi.fn();
  const streamResponse = vi.fn();

  return {
    catalogStore: {
      findDocumentByIdentity,
    },
    conversationStore: {
      persistAssistantMessageWithCitations,
      persistConversationTurnWithCitations,
      createConversationWithFirstUserMessage,
      findConversationHistoryForUserById,
    },
    openAI: {
      retrieveVectorStore,
      streamResponse,
    },
    spies: {
      createConversationWithFirstUserMessage,
      persistAssistantMessageWithCitations,
      retrieveVectorStore,
      streamResponse,
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

function createChatResponseStreamService(deps: ReturnType<typeof createDeps>) {
  return createCreateChatResponseStream({
    activeVectorStoreId: "vs_active_123",
    catalogStore: deps.catalogStore,
    conversationStore: deps.conversationStore,
    enablePromptCaching: false,
    maxHistoryTurns: 12,
    maxOutputTokens: 800,
    model: "gpt-5-nano",
    openAI: deps.openAI,
  });
}

describe("createCreateChatResponseStream", () => {
  it("creates a new conversation, opens a stream, and finalizes the assistant message", async () => {
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

    const finalResponse = {
      id: "resp_123",
      output: [
        {
          content: [
            {
              annotations: [],
              text: "Respuesta streameada final.",
              type: "output_text",
            },
          ],
          id: "message_1",
          role: "assistant",
          status: "completed",
          type: "message",
        },
      ],
      output_text: "Respuesta streameada final.",
    };
    const stream = {
      async finalResponse() {
        return finalResponse;
      },
      async *[Symbol.asyncIterator]() {
        yield {
          delta: "Respuesta streameada",
          type: "response.output_text.delta",
        };
      },
    };
    deps.spies.streamResponse.mockReturnValueOnce(stream as never);

    const createChatResponseStream = createChatResponseStreamService(deps);
    const preparedStream = await createChatResponseStream({
      message: "Consulta inicial",
      userId: "user-1",
    });
    const result = await preparedStream.finalize();

    expect(preparedStream.context.resolvedConversationId).toBe(
      "conversation-1",
    );
    expect(deps.spies.streamResponse).toHaveBeenCalledWith({
      include: ["file_search_call.results"],
      input: "Consulta inicial",
      instructions: expect.any(String),
      max_output_tokens: 800,
      model: "gpt-5-nano",
      reasoning: {
        effort: "low",
      },
      store: false,
      stream: true,
      tools: [
        {
          type: "file_search",
          vector_store_ids: ["vs_active_123"],
        },
      ],
    });
    expect(
      deps.spies.persistAssistantMessageWithCitations,
    ).toHaveBeenCalledWith({
      citations: [],
      content: "Respuesta streameada final.",
      conversationId: "conversation-1",
      providerMessageId: "resp_123",
      userId: "user-1",
    });
    expect(result).toEqual({
      citations: [],
      conversationId: "conversation-1",
      grounded: false,
      messageId: "resp_123",
      text: "Respuesta streameada final.",
    });
  });

  it("accepts streamed final responses that expose id and output but not output_text", async () => {
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

    const finalResponse = {
      id: "resp_without_output_text",
      object: "response",
      output: [
        {
          content: [
            {
              annotations: [],
              text: "Texto final desde output.",
              type: "output_text",
            },
          ],
          id: "message_1",
          role: "assistant",
          status: "completed",
          type: "message",
        },
      ],
    };
    const stream = {
      async finalResponse() {
        return finalResponse;
      },
      async *[Symbol.asyncIterator]() {
        yield {
          delta: "Texto final",
          type: "response.output_text.delta",
        };
      },
    };
    deps.spies.streamResponse.mockReturnValueOnce(stream as never);

    const createChatResponseStream = createChatResponseStreamService(deps);
    const preparedStream = await createChatResponseStream({
      message: "Consulta inicial",
      userId: "user-1",
    });
    const result = await preparedStream.finalize();

    expect(result.messageId).toBe("resp_without_output_text");
    expect(result.text).toBe("Texto final desde output.");
  });
});
