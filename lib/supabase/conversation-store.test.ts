import { describe, expect, it, vi } from "vitest";
import {
  createConversationStore,
  MAX_CONVERSATION_TITLE_LENGTH,
  normalizeConversationTitleFromMessage,
} from "./conversation-store";

describe("normalizeConversationTitleFromMessage", () => {
  it("trims and collapses whitespace without truncating short messages", () => {
    expect(
      normalizeConversationTitleFromMessage(
        "   Primera   consulta\n\ncon   saltos de linea   ",
      ),
    ).toBe("Primera consulta con saltos de linea");
  });

  it("truncates long messages and appends an ellipsis within the max length", () => {
    const title = normalizeConversationTitleFromMessage(
      "x".repeat(MAX_CONVERSATION_TITLE_LENGTH + 12),
    );

    expect(title).toHaveLength(MAX_CONVERSATION_TITLE_LENGTH);
    expect(title.endsWith("...")).toBe(true);
  });
});

describe("createConversationStore", () => {
  it("persists an assistant reply and its citations through the dedicated RPC", async () => {
    const singleMock = vi.fn().mockResolvedValue({
      data: {
        assistant_message_id: "assistant-message-1",
        assistant_created_at: "2026-03-31T12:01:00.000Z",
        dataset_version: "mvp-2026-03",
        last_message_at: "2026-03-31T12:01:00.000Z",
        vector_store_id: "vs_active_123",
      },
      error: null,
    });
    const rpcMock = vi.fn().mockReturnValue({
      single: singleMock,
    });
    const store = createConversationStore({
      rpc: rpcMock,
    } as never);

    const result = await store.persistAssistantMessageWithCitations({
      citations: [
        {
          documentId: "botanica-mvp-v1-corpus-mvp",
          documentName: "Corpus MVP botánico · botanica-mvp-v1",
          fileId: "file-1",
          snippet: "Snippet persistido.",
          vectorStoreId: "vs_active_123",
        },
      ],
      content: "Respuesta persistida",
      conversationId: "conversation-1",
      datasetVersion: "mvp-2026-03",
      providerMessageId: "resp_123",
      userId: "user-1",
      vectorStoreId: "vs_active_123",
    });

    expect(rpcMock).toHaveBeenCalledWith(
      "persist_assistant_message_with_citations",
      {
        p_citations: [
          {
            documentId: "botanica-mvp-v1-corpus-mvp",
            documentName: "Corpus MVP botánico · botanica-mvp-v1",
            fileId: "file-1",
            snippet: "Snippet persistido.",
            vectorStoreId: "vs_active_123",
          },
        ],
        p_content: "Respuesta persistida",
        p_conversation_id: "conversation-1",
        p_dataset_version: "mvp-2026-03",
        p_provider_message_id: "resp_123",
        p_user_id: "user-1",
        p_vector_store_id: "vs_active_123",
      },
    );
    expect(result).toEqual({
      assistantCreatedAt: "2026-03-31T12:01:00.000Z",
      assistantMessageId: "assistant-message-1",
      datasetVersion: "mvp-2026-03",
      lastMessageAt: "2026-03-31T12:01:00.000Z",
      vectorStoreId: "vs_active_123",
    });
  });

  it("persists a full follow-up exchange and its citations through the dedicated RPC", async () => {
    const singleMock = vi.fn().mockResolvedValue({
      data: {
        assistant_created_at: "2026-03-31T12:02:00.000Z",
        assistant_message_id: "assistant-message-1",
        dataset_version: "mvp-2026-03",
        last_message_at: "2026-03-31T12:02:00.000Z",
        user_created_at: "2026-03-31T12:01:59.000Z",
        user_message_id: "user-message-1",
        vector_store_id: "vs_active_123",
      },
      error: null,
    });
    const rpcMock = vi.fn().mockReturnValue({
      single: singleMock,
    });
    const store = createConversationStore({
      rpc: rpcMock,
    } as never);

    const result = await store.persistConversationTurnWithCitations({
      assistantContent: "Respuesta persistida",
      assistantProviderMessageId: "resp_456",
      citations: [],
      conversationId: "conversation-1",
      datasetVersion: "mvp-2026-03",
      userContent: "Seguimiento persistido",
      userId: "user-1",
      vectorStoreId: "vs_active_123",
    });

    expect(rpcMock).toHaveBeenCalledWith(
      "persist_chat_exchange_with_citations",
      {
        p_assistant_content: "Respuesta persistida",
        p_assistant_provider_message_id: "resp_456",
        p_citations: [],
        p_conversation_id: "conversation-1",
        p_dataset_version: "mvp-2026-03",
        p_user_content: "Seguimiento persistido",
        p_user_id: "user-1",
        p_vector_store_id: "vs_active_123",
      },
    );
    expect(result).toEqual({
      assistantCreatedAt: "2026-03-31T12:02:00.000Z",
      assistantMessageId: "assistant-message-1",
      datasetVersion: "mvp-2026-03",
      lastMessageAt: "2026-03-31T12:02:00.000Z",
      userCreatedAt: "2026-03-31T12:01:59.000Z",
      userMessageId: "user-message-1",
      vectorStoreId: "vs_active_123",
    });
  });

  it("creates a persisted conversation through the atomic RPC function", async () => {
    const singleMock = vi.fn().mockResolvedValue({
      data: {
        conversation_id: "conversation-1",
        dataset_version: "mvp-2026-03",
        message_id: "message-1",
        title: "Consulta inicial",
        status: "active",
        created_at: "2026-03-19T12:00:00.000Z",
        updated_at: "2026-03-19T12:00:00.000Z",
        last_message_at: "2026-03-19T12:00:00.000Z",
        vector_store_id: "vs_active_123",
      },
      error: null,
    });
    const rpcMock = vi.fn().mockReturnValue({
      single: singleMock,
    });
    const store = createConversationStore({
      rpc: rpcMock,
    } as never);

    const result = await store.createConversationWithFirstUserMessage({
      userId: "user-1",
      content: "  Consulta inicial   con   espacios  ",
      datasetVersion: "mvp-2026-03",
      vectorStoreId: "vs_active_123",
    });

    expect(rpcMock).toHaveBeenCalledWith(
      "create_conversation_with_first_message",
      {
        p_user_id: "user-1",
        p_content: "  Consulta inicial   con   espacios  ",
        p_dataset_version: "mvp-2026-03",
        p_title: "Consulta inicial con espacios",
        p_vector_store_id: "vs_active_123",
      },
    );
    expect(result).toEqual({
      conversationId: "conversation-1",
      datasetVersion: "mvp-2026-03",
      messageId: "message-1",
      title: "Consulta inicial",
      status: "active",
      createdAt: "2026-03-19T12:00:00.000Z",
      updatedAt: "2026-03-19T12:00:00.000Z",
      lastMessageAt: "2026-03-19T12:00:00.000Z",
      vectorStoreId: "vs_active_123",
    });
  });

  it("lists only the persisted history returned for the requested user in RPC order", async () => {
    const rpcMock = vi.fn().mockResolvedValue({
      data: [
        {
          conversation_id: "conversation-2",
          dataset_version: "mvp-2026-03",
          title: "Mas reciente",
          status: "active",
          created_at: "2026-03-19T14:00:00.000Z",
          updated_at: "2026-03-19T14:00:00.000Z",
          last_message_at: "2026-03-19T14:05:00.000Z",
          vector_store_id: "vs_active_123",
          messages: [
            {
              citations: [
                {
                  documentId: "botanica-mvp-v1-corpus-mvp",
                  documentName: "Corpus MVP botánico · botanica-mvp-v1",
                  fileId: "file-1",
                  snippet: "Snippet SSR.",
                  vectorStoreId: "vs_active_123",
                },
              ],
              id: "message-2",
              providerMessageId: "resp_123",
              role: "assistant",
              content: "Respuesta reciente",
              createdAt: "2026-03-19T14:05:00.000Z",
            },
          ],
        },
        {
          conversation_id: "conversation-1",
          dataset_version: null,
          title: "Anterior",
          status: "active",
          created_at: "2026-03-19T13:00:00.000Z",
          updated_at: "2026-03-19T13:00:00.000Z",
          last_message_at: "2026-03-19T13:05:00.000Z",
          vector_store_id: null,
          messages: [
            {
              citations: [],
              id: "message-1",
              providerMessageId: null,
              role: "user",
              content: "Primer mensaje",
              createdAt: "2026-03-19T13:05:00.000Z",
            },
          ],
        },
      ],
      error: null,
    });
    const store = createConversationStore({
      rpc: rpcMock,
    } as never);

    const result = await store.listConversationHistoryForUser("user-1");

    expect(rpcMock).toHaveBeenCalledWith("list_conversation_history_for_user", {
      p_user_id: "user-1",
    });
    expect(result.map((conversation) => conversation.id)).toEqual([
      "conversation-2",
      "conversation-1",
    ]);
    expect(result[0]?.messages[0]?.content).toBe("Respuesta reciente");
    expect(result[0]?.messages[0]?.citations).toEqual([
      {
        documentId: "botanica-mvp-v1-corpus-mvp",
        documentName: "Corpus MVP botánico · botanica-mvp-v1",
        fileId: "file-1",
        snippet: "Snippet SSR.",
        vectorStoreId: "vs_active_123",
      },
    ]);
    expect(result[0]?.messages[0]?.grounded).toBe(true);
    expect(result[0]?.messages[0]?.providerMessageId).toBe("resp_123");
    expect(result[0]?.datasetVersion).toBe("mvp-2026-03");
    expect(result[0]?.vectorStoreId).toBe("vs_active_123");
  });

  it("loads one persisted conversation by id for the requested user", async () => {
    const maybeSingleMock = vi.fn().mockResolvedValue({
      data: {
        id: "conversation-1",
        dataset_version: "mvp-2026-03",
        title: "Consulta focalizada",
        status: "active",
        created_at: "2026-03-19T13:00:00.000Z",
        updated_at: "2026-03-19T13:05:00.000Z",
        last_message_at: "2026-03-19T13:05:00.000Z",
        vector_store_id: "vs_active_123",
      },
      error: null,
    });
    const conversationEqUserIdMock = vi.fn().mockReturnValue({
      maybeSingle: maybeSingleMock,
    });
    const conversationEqIdMock = vi.fn().mockReturnValue({
      eq: conversationEqUserIdMock,
    });
    const conversationSelectMock = vi.fn().mockReturnValue({
      eq: conversationEqIdMock,
    });
    const messageOrderMock = vi.fn().mockResolvedValue({
      data: [
        {
          id: "message-1",
          provider_message_id: null,
          role: "user",
          content: "Primer mensaje",
          created_at: "2026-03-19T13:00:00.000Z",
        },
        {
          id: "message-2",
          provider_message_id: "resp_123",
          role: "assistant",
          content: "Respuesta previa",
          created_at: "2026-03-19T13:01:00.000Z",
        },
      ],
      error: null,
    });
    const citationOrderMock = vi.fn().mockResolvedValue({
      data: [
        {
          citation_index: 0,
          document_id: "botanica-mvp-v1-corpus-mvp",
          document_name: "Corpus MVP botánico · botanica-mvp-v1",
          file_id: "file-1",
          message_id: "message-2",
          snippet: "Snippet persistido.",
          vector_store_id: "vs_active_123",
        },
      ],
      error: null,
    });
    const messageEqConversationIdMock = vi.fn().mockReturnValue({
      order: messageOrderMock,
    });
    const messageSelectMock = vi.fn().mockReturnValue({
      eq: messageEqConversationIdMock,
    });
    const citationInMock = vi.fn().mockReturnValue({
      order: citationOrderMock,
    });
    const citationSelectMock = vi.fn().mockReturnValue({
      in: citationInMock,
    });
    const fromMock = vi.fn((table: string) => {
      if (table === "conversations") {
        return {
          select: conversationSelectMock,
        };
      }

      if (table === "messages") {
        return {
          select: messageSelectMock,
        };
      }

      if (table === "message_citations") {
        return {
          select: citationSelectMock,
        };
      }

      throw new Error(`Unexpected table lookup: ${table}`);
    });
    const store = createConversationStore({
      from: fromMock,
      rpc: vi.fn(),
    } as never);

    const result = await store.findConversationHistoryForUserById(
      "user-1",
      "conversation-1",
    );

    expect(fromMock).toHaveBeenNthCalledWith(1, "conversations");
    expect(conversationSelectMock).toHaveBeenCalledWith(
      "id, title, status, created_at, updated_at, last_message_at, dataset_version, vector_store_id",
    );
    expect(conversationEqIdMock).toHaveBeenCalledWith("id", "conversation-1");
    expect(conversationEqUserIdMock).toHaveBeenCalledWith("user_id", "user-1");
    expect(fromMock).toHaveBeenNthCalledWith(2, "messages");
    expect(messageSelectMock).toHaveBeenCalledWith(
      "id, role, content, created_at, provider_message_id",
    );
    expect(messageEqConversationIdMock).toHaveBeenCalledWith(
      "conversation_id",
      "conversation-1",
    );
    expect(messageOrderMock).toHaveBeenCalledWith("created_at", {
      ascending: true,
    });
    expect(fromMock).toHaveBeenNthCalledWith(3, "message_citations");
    expect(citationSelectMock).toHaveBeenCalledWith(
      "message_id, citation_index, document_id, document_name, snippet, file_id, vector_store_id",
    );
    expect(citationInMock).toHaveBeenCalledWith("message_id", [
      "message-1",
      "message-2",
    ]);
    expect(result).toEqual({
      id: "conversation-1",
      datasetVersion: "mvp-2026-03",
      title: "Consulta focalizada",
      status: "active",
      createdAt: "2026-03-19T13:00:00.000Z",
      updatedAt: "2026-03-19T13:05:00.000Z",
      lastMessageAt: "2026-03-19T13:05:00.000Z",
      vectorStoreId: "vs_active_123",
      messages: [
        {
          citations: [],
          id: "message-1",
          grounded: false,
          providerMessageId: null,
          role: "user",
          content: "Primer mensaje",
          createdAt: "2026-03-19T13:00:00.000Z",
        },
        {
          citations: [
            {
              documentId: "botanica-mvp-v1-corpus-mvp",
              documentName: "Corpus MVP botánico · botanica-mvp-v1",
              fileId: "file-1",
              snippet: "Snippet persistido.",
              vectorStoreId: "vs_active_123",
            },
          ],
          id: "message-2",
          grounded: true,
          providerMessageId: "resp_123",
          role: "assistant",
          content: "Respuesta previa",
          createdAt: "2026-03-19T13:01:00.000Z",
        },
      ],
    });
  });

  it("returns null when the requested conversation does not belong to the user", async () => {
    const maybeSingleMock = vi.fn().mockResolvedValue({
      data: null,
      error: null,
    });
    const conversationEqUserIdMock = vi.fn().mockReturnValue({
      maybeSingle: maybeSingleMock,
    });
    const conversationEqIdMock = vi.fn().mockReturnValue({
      eq: conversationEqUserIdMock,
    });
    const conversationSelectMock = vi.fn().mockReturnValue({
      eq: conversationEqIdMock,
    });
    const fromMock = vi.fn(() => ({
      select: conversationSelectMock,
    }));
    const store = createConversationStore({
      from: fromMock,
      rpc: vi.fn(),
    } as never);

    const result = await store.findConversationHistoryForUserById(
      "user-1",
      "missing-conversation",
    );

    expect(result).toBeNull();
    expect(fromMock).toHaveBeenCalledTimes(1);
  });
});
