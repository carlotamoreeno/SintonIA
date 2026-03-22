import "server-only";

import { z } from "zod";
import { supabaseAdmin, type SupabaseAdminClient } from "./client";

export const MAX_CONVERSATION_TITLE_LENGTH = 80;

const persistedConversationMessageRoleSchema = z.enum([
  "user",
  "assistant",
  "system",
]);

const persistedConversationHistoryMessageSchema = z.object({
  id: z.string().min(1),
  role: persistedConversationMessageRoleSchema,
  content: z.string(),
  createdAt: z.string().datetime({ offset: true }),
});

const persistedConversationHistoryRowSchema = z.object({
  conversation_id: z.string().min(1),
  title: z.string().nullable(),
  status: z.string().min(1),
  created_at: z.string().datetime({ offset: true }),
  updated_at: z.string().datetime({ offset: true }),
  last_message_at: z.string().datetime({ offset: true }).nullable(),
  messages: z.array(persistedConversationHistoryMessageSchema).default([]),
});

const createConversationResultSchema = z.object({
  conversation_id: z.string().min(1),
  message_id: z.string().min(1),
  title: z.string().nullable(),
  status: z.string().min(1),
  created_at: z.string().datetime({ offset: true }),
  updated_at: z.string().datetime({ offset: true }),
  last_message_at: z.string().datetime({ offset: true }).nullable(),
});

export type PersistedConversationHistoryMessage = z.infer<
  typeof persistedConversationHistoryMessageSchema
>;

export type PersistedConversationHistoryConversation = {
  createdAt: string;
  id: string;
  lastMessageAt: string | null;
  messages: PersistedConversationHistoryMessage[];
  status: string;
  title: string | null;
  updatedAt: string;
};

export type CreateConversationWithFirstUserMessageResult = {
  conversationId: string;
  createdAt: string;
  lastMessageAt: string | null;
  messageId: string;
  status: string;
  title: string | null;
  updatedAt: string;
};

type ConversationStoreClient = Pick<SupabaseAdminClient, "rpc">;

export type ConversationStore = {
  createConversationWithFirstUserMessage(input: {
    content: string;
    userId: string;
  }): Promise<CreateConversationWithFirstUserMessageResult>;
  listConversationHistoryForUser(
    userId: string,
  ): Promise<PersistedConversationHistoryConversation[]>;
};

export function normalizeConversationTitleFromMessage(
  message: string,
  maxLength = MAX_CONVERSATION_TITLE_LENGTH,
) {
  const normalized = message.trim().replace(/\s+/g, " ");

  if (normalized.length <= maxLength) {
    return normalized;
  }

  if (maxLength <= 3) {
    return "...".slice(0, maxLength);
  }

  return `${normalized.slice(0, maxLength - 3).trimEnd()}...`;
}

export function createConversationStore(
  client: ConversationStoreClient = supabaseAdmin,
): ConversationStore {
  return {
    async createConversationWithFirstUserMessage({ userId, content }) {
      const { data, error } = await client
        .rpc("create_conversation_with_first_message", {
          p_content: content,
          p_title: normalizeConversationTitleFromMessage(content),
          p_user_id: userId,
        })
        .single();

      if (error || !data) {
        throw new Error(
          `Failed to create persisted conversation: ${error?.message}`,
        );
      }

      const result = createConversationResultSchema.parse(data);

      return {
        conversationId: result.conversation_id,
        messageId: result.message_id,
        title: result.title,
        status: result.status,
        createdAt: result.created_at,
        updatedAt: result.updated_at,
        lastMessageAt: result.last_message_at,
      };
    },

    async listConversationHistoryForUser(userId) {
      const { data, error } = await client.rpc(
        "list_conversation_history_for_user",
        {
          p_user_id: userId,
        },
      );

      if (error) {
        throw new Error(
          `Failed to load persisted conversation history: ${error.message}`,
        );
      }

      return persistedConversationHistoryRowSchema
        .array()
        .parse(data ?? [])
        .map((conversation) => ({
          id: conversation.conversation_id,
          title: conversation.title,
          status: conversation.status,
          createdAt: conversation.created_at,
          updatedAt: conversation.updated_at,
          lastMessageAt: conversation.last_message_at,
          messages: conversation.messages,
        }));
    },
  };
}

export const conversationStore = createConversationStore();
