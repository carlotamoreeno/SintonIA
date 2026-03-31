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
  it("creates a persisted conversation through the atomic RPC function", async () => {
    const singleMock = vi.fn().mockResolvedValue({
      data: {
        conversation_id: "conversation-1",
        message_id: "message-1",
        title: "Consulta inicial",
        status: "active",
        created_at: "2026-03-19T12:00:00.000Z",
        updated_at: "2026-03-19T12:00:00.000Z",
        last_message_at: "2026-03-19T12:00:00.000Z",
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
    });

    expect(rpcMock).toHaveBeenCalledWith(
      "create_conversation_with_first_message",
      {
        p_user_id: "user-1",
        p_content: "  Consulta inicial   con   espacios  ",
        p_title: "Consulta inicial con espacios",
      },
    );
    expect(result).toEqual({
      conversationId: "conversation-1",
      messageId: "message-1",
      title: "Consulta inicial",
      status: "active",
      createdAt: "2026-03-19T12:00:00.000Z",
      updatedAt: "2026-03-19T12:00:00.000Z",
      lastMessageAt: "2026-03-19T12:00:00.000Z",
    });
  });

  it("lists only the persisted history returned for the requested user in RPC order", async () => {
    const rpcMock = vi.fn().mockResolvedValue({
      data: [
        {
          conversation_id: "conversation-2",
          title: "Mas reciente",
          status: "active",
          created_at: "2026-03-19T14:00:00.000Z",
          updated_at: "2026-03-19T14:00:00.000Z",
          last_message_at: "2026-03-19T14:05:00.000Z",
          messages: [
            {
              id: "message-2",
              role: "user",
              content: "Segundo mensaje",
              createdAt: "2026-03-19T14:05:00.000Z",
            },
          ],
        },
        {
          conversation_id: "conversation-1",
          title: "Anterior",
          status: "active",
          created_at: "2026-03-19T13:00:00.000Z",
          updated_at: "2026-03-19T13:00:00.000Z",
          last_message_at: "2026-03-19T13:05:00.000Z",
          messages: [
            {
              id: "message-1",
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
    expect(result[0]?.messages[0]?.content).toBe("Segundo mensaje");
  });

  it("loads one persisted conversation by id for the requested user", async () => {
    const maybeSingleMock = vi.fn().mockResolvedValue({
      data: {
        id: "conversation-1",
        title: "Consulta focalizada",
        status: "active",
        created_at: "2026-03-19T13:00:00.000Z",
        updated_at: "2026-03-19T13:05:00.000Z",
        last_message_at: "2026-03-19T13:05:00.000Z",
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
          role: "user",
          content: "Primer mensaje",
          created_at: "2026-03-19T13:00:00.000Z",
        },
        {
          id: "message-2",
          role: "assistant",
          content: "Respuesta previa",
          created_at: "2026-03-19T13:01:00.000Z",
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
      "id, title, status, created_at, updated_at, last_message_at",
    );
    expect(conversationEqIdMock).toHaveBeenCalledWith("id", "conversation-1");
    expect(conversationEqUserIdMock).toHaveBeenCalledWith("user_id", "user-1");
    expect(fromMock).toHaveBeenNthCalledWith(2, "messages");
    expect(messageSelectMock).toHaveBeenCalledWith(
      "id, role, content, created_at",
    );
    expect(messageEqConversationIdMock).toHaveBeenCalledWith(
      "conversation_id",
      "conversation-1",
    );
    expect(messageOrderMock).toHaveBeenCalledWith("created_at", {
      ascending: true,
    });
    expect(result).toEqual({
      id: "conversation-1",
      title: "Consulta focalizada",
      status: "active",
      createdAt: "2026-03-19T13:00:00.000Z",
      updatedAt: "2026-03-19T13:05:00.000Z",
      lastMessageAt: "2026-03-19T13:05:00.000Z",
      messages: [
        {
          id: "message-1",
          role: "user",
          content: "Primer mensaje",
          createdAt: "2026-03-19T13:00:00.000Z",
        },
        {
          id: "message-2",
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
