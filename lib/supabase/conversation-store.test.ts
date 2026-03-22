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
});
