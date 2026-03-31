import "server-only";

import { z } from "zod";
import { supabaseAdmin, type SupabaseAdminClient } from "./client";

export const MAX_CONVERSATION_TITLE_LENGTH = 80;

const persistedConversationCitationSchema = z.object({
  documentId: z.string().min(1),
  documentName: z.string().min(1),
  fileId: z.string().min(1),
  snippet: z.string().min(1),
  vectorStoreId: z.string().min(1),
});

const persistedConversationMessageRoleSchema = z.enum([
  "user",
  "assistant",
  "system",
]);

const persistedConversationHistoryMessageSchema = z.object({
  citations: z.array(persistedConversationCitationSchema).default([]),
  id: z.string().min(1),
  providerMessageId: z.string().min(1).nullable().default(null),
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

const persistedConversationSummaryRowSchema = z.object({
  id: z.string().min(1),
  title: z.string().nullable(),
  status: z.string().min(1),
  created_at: z.string().datetime({ offset: true }),
  updated_at: z.string().datetime({ offset: true }),
  last_message_at: z.string().datetime({ offset: true }).nullable(),
});

const persistedConversationMessageRowSchema = z.object({
  id: z.string().min(1),
  provider_message_id: z.string().min(1).nullable(),
  role: persistedConversationMessageRoleSchema,
  content: z.string(),
  created_at: z.string().datetime({ offset: true }),
});

const persistedConversationCitationRowSchema = z.object({
  citation_index: z.number().int().nonnegative(),
  document_id: z.string().min(1),
  document_name: z.string().min(1),
  file_id: z.string().min(1),
  message_id: z.string().min(1),
  snippet: z.string().min(1),
  vector_store_id: z.string().min(1),
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

const persistAssistantMessageResultSchema = z.object({
  assistant_created_at: z.string().datetime({ offset: true }),
  assistant_message_id: z.string().min(1),
  last_message_at: z.string().datetime({ offset: true }).nullable(),
});

const persistConversationTurnResultSchema = z.object({
  assistant_created_at: z.string().datetime({ offset: true }),
  assistant_message_id: z.string().min(1),
  last_message_at: z.string().datetime({ offset: true }).nullable(),
  user_created_at: z.string().datetime({ offset: true }),
  user_message_id: z.string().min(1),
});

export type PersistedConversationCitation = z.infer<
  typeof persistedConversationCitationSchema
>;

export type PersistedConversationHistoryMessage = z.infer<
  typeof persistedConversationHistoryMessageSchema
> & {
  grounded: boolean;
};

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

export type PersistAssistantMessageResult = {
  assistantCreatedAt: string;
  assistantMessageId: string;
  lastMessageAt: string | null;
};

export type PersistConversationTurnResult = {
  assistantCreatedAt: string;
  assistantMessageId: string;
  lastMessageAt: string | null;
  userCreatedAt: string;
  userMessageId: string;
};

type ConversationStoreClient = Pick<SupabaseAdminClient, "from" | "rpc">;

export type ConversationStore = {
  persistAssistantMessageWithCitations(input: {
    citations: PersistedConversationCitation[];
    content: string;
    conversationId: string;
    providerMessageId: string;
    userId: string;
  }): Promise<PersistAssistantMessageResult>;
  persistConversationTurnWithCitations(input: {
    assistantContent: string;
    assistantProviderMessageId: string;
    citations: PersistedConversationCitation[];
    conversationId: string;
    userId: string;
    userContent: string;
  }): Promise<PersistConversationTurnResult>;
  createConversationWithFirstUserMessage(input: {
    content: string;
    userId: string;
  }): Promise<CreateConversationWithFirstUserMessageResult>;
  findConversationHistoryForUserById(
    userId: string,
    conversationId: string,
  ): Promise<PersistedConversationHistoryConversation | null>;
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

function buildPersistedConversationHistoryMessage(input: {
  citations?: PersistedConversationCitation[];
  content: string;
  createdAt: string;
  id: string;
  providerMessageId?: string | null;
  role: z.infer<typeof persistedConversationMessageRoleSchema>;
}): PersistedConversationHistoryMessage {
  const message = persistedConversationHistoryMessageSchema.parse({
    citations: input.citations ?? [],
    content: input.content,
    createdAt: input.createdAt,
    id: input.id,
    providerMessageId: input.providerMessageId ?? null,
    role: input.role,
  });

  return {
    ...message,
    grounded: message.citations.length > 0,
  };
}

export function createConversationStore(
  client: ConversationStoreClient = supabaseAdmin,
): ConversationStore {
  return {
    async persistAssistantMessageWithCitations({
      citations,
      content,
      conversationId,
      providerMessageId,
      userId,
    }) {
      const { data, error } = await client
        .rpc("persist_assistant_message_with_citations", {
          p_citations: citations,
          p_content: content,
          p_conversation_id: conversationId,
          p_provider_message_id: providerMessageId,
          p_user_id: userId,
        })
        .single();

      if (error || !data) {
        throw new Error(
          `Failed to persist assistant chat message: ${error?.message}`,
        );
      }

      const result = persistAssistantMessageResultSchema.parse(data);

      return {
        assistantCreatedAt: result.assistant_created_at,
        assistantMessageId: result.assistant_message_id,
        lastMessageAt: result.last_message_at,
      };
    },

    async persistConversationTurnWithCitations({
      assistantContent,
      assistantProviderMessageId,
      citations,
      conversationId,
      userContent,
      userId,
    }) {
      const { data, error } = await client
        .rpc("persist_chat_exchange_with_citations", {
          p_assistant_content: assistantContent,
          p_assistant_provider_message_id: assistantProviderMessageId,
          p_citations: citations,
          p_conversation_id: conversationId,
          p_user_content: userContent,
          p_user_id: userId,
        })
        .single();

      if (error || !data) {
        throw new Error(`Failed to persist chat exchange: ${error?.message}`);
      }

      const result = persistConversationTurnResultSchema.parse(data);

      return {
        assistantCreatedAt: result.assistant_created_at,
        assistantMessageId: result.assistant_message_id,
        lastMessageAt: result.last_message_at,
        userCreatedAt: result.user_created_at,
        userMessageId: result.user_message_id,
      };
    },

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
          messages: conversation.messages.map((message) =>
            buildPersistedConversationHistoryMessage(message),
          ),
        }));
    },

    async findConversationHistoryForUserById(userId, conversationId) {
      const { data: conversationRow, error: conversationError } = await client
        .from("conversations")
        .select("id, title, status, created_at, updated_at, last_message_at")
        .eq("id", conversationId)
        .eq("user_id", userId)
        .maybeSingle();

      if (conversationError) {
        throw new Error(
          `Failed to load persisted conversation: ${conversationError.message}`,
        );
      }

      if (!conversationRow) {
        return null;
      }

      const { data: messageRows, error: messageError } = await client
        .from("messages")
        .select("id, role, content, created_at, provider_message_id")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true });

      if (messageError) {
        throw new Error(
          `Failed to load persisted conversation messages: ${messageError.message}`,
        );
      }

      const conversation =
        persistedConversationSummaryRowSchema.parse(conversationRow);
      const parsedMessages = persistedConversationMessageRowSchema
        .array()
        .parse(messageRows ?? []);
      const messageIds = parsedMessages.map((message) => message.id);
      const citationsByMessageId = new Map<
        string,
        PersistedConversationCitation[]
      >();

      if (messageIds.length > 0) {
        const { data: citationRows, error: citationError } = await client
          .from("message_citations")
          .select(
            "message_id, citation_index, document_id, document_name, snippet, file_id, vector_store_id",
          )
          .in("message_id", messageIds)
          .order("citation_index", { ascending: true });

        if (citationError) {
          throw new Error(
            `Failed to load persisted conversation citations: ${citationError.message}`,
          );
        }

        for (const citation of persistedConversationCitationRowSchema
          .array()
          .parse(citationRows ?? [])) {
          const nextCitations =
            citationsByMessageId.get(citation.message_id) ?? [];
          nextCitations.push({
            documentId: citation.document_id,
            documentName: citation.document_name,
            fileId: citation.file_id,
            snippet: citation.snippet,
            vectorStoreId: citation.vector_store_id,
          });
          citationsByMessageId.set(citation.message_id, nextCitations);
        }
      }

      const messages = parsedMessages.map((message) =>
        buildPersistedConversationHistoryMessage({
          citations: citationsByMessageId.get(message.id) ?? [],
          content: message.content,
          createdAt: message.created_at,
          id: message.id,
          providerMessageId: message.provider_message_id,
          role: message.role,
        }),
      );

      return {
        id: conversation.id,
        title: conversation.title,
        status: conversation.status,
        createdAt: conversation.created_at,
        updatedAt: conversation.updated_at,
        lastMessageAt: conversation.last_message_at,
        messages,
      };
    },
  };
}

export const conversationStore = createConversationStore();
