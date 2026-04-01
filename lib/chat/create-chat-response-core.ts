import { createHash } from "node:crypto";
import { z } from "zod";
import {
  OpenAIAdapterError,
  type OpenAIAdapter,
  type OpenAIResponsesCreateParams,
  type OpenAIResponsesCreateResult,
} from "@/lib/openai/adapter-core";
import type { KnowledgeDocumentCatalogStore } from "@/lib/supabase/knowledge-document-store";
import type { ConversationStore } from "@/lib/supabase/conversation-store";
import { chatRequestBodySchema } from "./chat-route";

const createChatResponseInputSchema = chatRequestBodySchema.extend({
  userId: z.string().trim().min(1),
});

type CreateChatResponseClient = Pick<
  OpenAIAdapter,
  "createResponse" | "retrieveVectorStore"
>;

type ActiveVectorStore = Awaited<
  ReturnType<CreateChatResponseClient["retrieveVectorStore"]>
>;
type PersistedConversationHistory = Exclude<
  Awaited<ReturnType<ConversationStore["findConversationHistoryForUserById"]>>,
  null
>;
type NonStreamingOpenAIResponse = Extract<
  OpenAIResponsesCreateResult,
  { output: Array<unknown> }
>;
type OpenAIResponseOutputItem = NonStreamingOpenAIResponse["output"][number];
type OpenAIResponseOutputMessage = Extract<
  OpenAIResponseOutputItem,
  { role: "assistant"; type: "message" }
>;
type OpenAIResponseOutputText = Extract<
  OpenAIResponseOutputMessage["content"][number],
  { type: "output_text" }
>;
type OpenAIResponseOutputTextAnnotation =
  OpenAIResponseOutputText["annotations"][number];
type OpenAIResponseFileSearchToolCall = Extract<
  OpenAIResponseOutputItem,
  { type: "file_search_call" }
>;
type OpenAIResponseFileSearchResult = NonNullable<
  OpenAIResponseFileSearchToolCall["results"]
>[number];

export type CreateChatResponseInput = z.input<
  typeof createChatResponseInputSchema
>;

export type ChatCitation = {
  documentId: string;
  documentName: string;
  fileId: string;
  snippet: string;
  vectorStoreId: string;
};

export type CreateChatResponseResult = {
  citations: ChatCitation[];
  conversationId: string;
  grounded: boolean;
  messageId: string;
  text: string;
};

export type CreateChatResponseErrorCode =
  | "conversation_not_found"
  | "rate_limited"
  | "upstream_timeout"
  | "upstream_request_failed";

type CreateChatResponseErrorInput = {
  cause?: unknown;
  code: CreateChatResponseErrorCode;
  message: string;
};

export class CreateChatResponseError extends Error {
  override readonly cause: unknown;
  readonly code: CreateChatResponseErrorCode;

  constructor(input: CreateChatResponseErrorInput) {
    super(input.message);
    this.name = "CreateChatResponseError";
    this.code = input.code;
    this.cause = input.cause;
  }
}

export type CreateChatResponseDeps = {
  activeVectorStoreId: string;
  catalogStore: Pick<KnowledgeDocumentCatalogStore, "findDocumentByIdentity">;
  conversationStore: Pick<
    ConversationStore,
    | "persistAssistantMessageWithCitations"
    | "persistConversationTurnWithCitations"
    | "createConversationWithFirstUserMessage"
    | "findConversationHistoryForUserById"
  >;
  enablePromptCaching: boolean;
  maxHistoryTurns: number;
  maxOutputTokens: number;
  model: string;
  openAI: CreateChatResponseClient;
};

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  if (typeof error === "string" && error.trim().length > 0) {
    return error;
  }

  return "Chat response generation failed.";
}

function formatOpenAIAdapterErrorMessage(error: OpenAIAdapterError) {
  const parts = [error.message];

  if (error.requestId) {
    parts.push(`request_id=${error.requestId}`);
  }

  if (error.code) {
    parts.push(`code=${error.code}`);
  }

  return parts.join(" | ");
}

function getDetailedErrorMessage(error: unknown) {
  if (error instanceof OpenAIAdapterError) {
    return formatOpenAIAdapterErrorMessage(error);
  }

  return getErrorMessage(error);
}

function isOpenAITimeoutError(error: OpenAIAdapterError) {
  return (
    error.status === 504 ||
    (error.cause instanceof Error &&
      error.cause.name === "APIConnectionTimeoutError")
  );
}

function getCreateChatResponseUpstreamErrorCode(
  error: unknown,
): CreateChatResponseErrorCode {
  if (error instanceof OpenAIAdapterError) {
    if (error.status === 429) {
      return "rate_limited";
    }

    if (isOpenAITimeoutError(error)) {
      return "upstream_timeout";
    }
  }

  return "upstream_request_failed";
}

function getRecentConversationMessages(
  messages: PersistedConversationHistory["messages"],
  maxHistoryTurns: number,
) {
  if (messages.length <= maxHistoryTurns) {
    return messages;
  }

  return messages.slice(-maxHistoryTurns);
}

function buildConversationInput(
  history: PersistedConversationHistory | null,
  maxHistoryTurns: number,
  message: string,
) {
  if (!history || history.messages.length === 0) {
    return message;
  }

  const recentMessages = getRecentConversationMessages(
    history.messages,
    maxHistoryTurns,
  );

  return [
    "Conversation history:",
    ...recentMessages.map(
      (entry) => `${entry.role.toUpperCase()}: ${entry.content}`,
    ),
    "",
    `USER: ${message}`,
  ].join("\n");
}

function buildPromptCacheKey(
  model: string,
  activeVectorStoreId: string,
  conversationId: string,
) {
  const hash = createHash("sha256")
    .update(`${model}:${activeVectorStoreId}:${conversationId}`)
    .digest("hex");

  return `chat_pc_${hash.slice(0, 32)}`;
}

function buildCreateResponseParams(
  deps: CreateChatResponseDeps,
  history: PersistedConversationHistory | null,
  conversationId: string,
  message: string,
): OpenAIResponsesCreateParams {
  const body: OpenAIResponsesCreateParams = {
    include: ["file_search_call.results"],
    input: buildConversationInput(history, deps.maxHistoryTurns, message),
    max_output_tokens: deps.maxOutputTokens,
    model: deps.model,
    store: false,
    tools: [
      {
        type: "file_search",
        vector_store_ids: [deps.activeVectorStoreId],
      },
    ],
  };

  if (deps.enablePromptCaching) {
    body.prompt_cache_key = buildPromptCacheKey(
      deps.model,
      deps.activeVectorStoreId,
      conversationId,
    );
  }

  return body;
}

function isActiveVectorStoreReady(
  vectorStore: Pick<ActiveVectorStore, "file_counts" | "status">,
) {
  return (
    vectorStore.status === "completed" && vectorStore.file_counts.completed > 0
  );
}

async function assertActiveVectorStoreReady(deps: CreateChatResponseDeps) {
  let vectorStore: ActiveVectorStore;

  try {
    vectorStore = await deps.openAI.retrieveVectorStore(
      deps.activeVectorStoreId,
    );
  } catch (error) {
    throw new CreateChatResponseError({
      cause: error,
      code: getCreateChatResponseUpstreamErrorCode(error),
      message: `Active vector store ${deps.activeVectorStoreId} could not be loaded for chat retrieval: ${getDetailedErrorMessage(error)}`,
    });
  }

  if (isActiveVectorStoreReady(vectorStore)) {
    return;
  }

  if (vectorStore.status !== "completed") {
    throw new CreateChatResponseError({
      code: "upstream_request_failed",
      message: `Active vector store ${deps.activeVectorStoreId} is not ready for chat retrieval: status=${vectorStore.status}.`,
    });
  }

  throw new CreateChatResponseError({
    code: "upstream_request_failed",
    message: `Active vector store ${deps.activeVectorStoreId} does not contain any completed files for chat retrieval.`,
  });
}

function isNonStreamingResponse(
  response: OpenAIResponsesCreateResult,
): response is NonStreamingOpenAIResponse & { id: string } {
  return (
    typeof response === "object" &&
    response !== null &&
    "id" in response &&
    typeof response.id === "string" &&
    "output_text" in response &&
    "output" in response &&
    Array.isArray(response.output)
  );
}

function getTrimmedString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function getPositiveInteger(value: unknown) {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) {
    return value;
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const parsedValue = Number(value);

    if (Number.isInteger(parsedValue) && parsedValue > 0) {
      return parsedValue;
    }
  }

  return null;
}

function getAnnotationFileId(annotation: OpenAIResponseOutputTextAnnotation) {
  switch (annotation.type) {
    case "container_file_citation":
    case "file_citation":
      return annotation.file_id;
    default:
      return null;
  }
}

function getChatCitationSource(
  catalogStore: CreateChatResponseDeps["catalogStore"],
  result: OpenAIResponseFileSearchResult,
  vectorStoreId: string,
): Promise<ChatCitation | null> {
  const fileId = getTrimmedString(result.file_id);
  const snippet = getTrimmedString(result.text);

  if (!fileId || !snippet) {
    return Promise.resolve(null);
  }

  const attributes =
    result.attributes &&
    typeof result.attributes === "object" &&
    !Array.isArray(result.attributes)
      ? result.attributes
      : null;

  let documentId = attributes ? getTrimmedString(attributes.doc_id) : null;
  let documentName = attributes ? getTrimmedString(attributes.title) : null;

  const datasetVersion = attributes
    ? getTrimmedString(attributes.dataset_version)
    : null;
  const documentVersion = attributes
    ? getPositiveInteger(attributes.document_version)
    : null;

  if (
    (!documentId || !documentName) &&
    datasetVersion &&
    documentId &&
    documentVersion
  ) {
    return catalogStore
      .findDocumentByIdentity({
        datasetVersion,
        docId: documentId,
        documentVersion,
      })
      .then((catalogDocument) => {
        if (catalogDocument) {
          documentId = catalogDocument.docId;
          documentName = documentName ?? catalogDocument.title;
        }

        if (!documentId || !documentName) {
          return null;
        }

        return {
          documentId,
          documentName,
          fileId,
          snippet,
          vectorStoreId,
        };
      });
  }

  if (!documentId || !documentName) {
    return Promise.resolve(null);
  }

  return Promise.resolve({
    documentId,
    documentName,
    fileId,
    snippet,
    vectorStoreId,
  });
}

async function buildChatCitationIndex(
  catalogStore: CreateChatResponseDeps["catalogStore"],
  response: NonStreamingOpenAIResponse,
  vectorStoreId: string,
) {
  const citationsByFileId = new Map<string, ChatCitation>();

  for (const item of response.output) {
    if (item.type !== "file_search_call" || !item.results) {
      continue;
    }

    for (const result of item.results) {
      const citation = await getChatCitationSource(
        catalogStore,
        result,
        vectorStoreId,
      );

      if (citation && !citationsByFileId.has(citation.fileId)) {
        citationsByFileId.set(citation.fileId, citation);
      }
    }
  }

  return citationsByFileId;
}

function extractOutputTextParts(message: OpenAIResponseOutputMessage) {
  return message.content.filter(
    (content): content is OpenAIResponseOutputText =>
      content.type === "output_text",
  );
}

async function getResponseCitations(
  catalogStore: CreateChatResponseDeps["catalogStore"],
  response: OpenAIResponsesCreateResult,
  vectorStoreId: string,
) {
  if (!isNonStreamingResponse(response)) {
    return [];
  }

  const citationsByFileId = await buildChatCitationIndex(
    catalogStore,
    response,
    vectorStoreId,
  );

  if (citationsByFileId.size === 0) {
    return [];
  }

  const citations: ChatCitation[] = [];
  const seenFileIds = new Set<string>();

  for (const item of response.output) {
    if (item.type !== "message" || item.role !== "assistant") {
      continue;
    }

    for (const content of extractOutputTextParts(item)) {
      for (const annotation of content.annotations) {
        const fileId = getAnnotationFileId(annotation);

        if (!fileId || seenFileIds.has(fileId)) {
          continue;
        }

        const citation = citationsByFileId.get(fileId);

        if (!citation) {
          continue;
        }

        seenFileIds.add(fileId);
        citations.push(citation);
      }
    }
  }

  return citations;
}

function getResponseId(response: OpenAIResponsesCreateResult) {
  if (isNonStreamingResponse(response) && response.id.trim().length > 0) {
    return response.id;
  }

  throw new CreateChatResponseError({
    code: "upstream_request_failed",
    message: "OpenAI response did not include a stable response id.",
  });
}

function getResponseText(response: OpenAIResponsesCreateResult) {
  if (
    isNonStreamingResponse(response) &&
    typeof response.output_text === "string" &&
    response.output_text.trim().length > 0
  ) {
    return response.output_text;
  }

  throw new CreateChatResponseError({
    code: "upstream_request_failed",
    message: "OpenAI response did not include output text.",
  });
}

export function createCreateChatResponse(deps: CreateChatResponseDeps) {
  return async function createChatResponse(
    input: CreateChatResponseInput,
  ): Promise<CreateChatResponseResult> {
    const parsedInput = createChatResponseInputSchema.parse(input);

    let isNewConversation = false;
    let resolvedConversationId = parsedInput.conversationId;
    let history = null;

    if (!resolvedConversationId) {
      isNewConversation = true;

      try {
        const createdConversation =
          await deps.conversationStore.createConversationWithFirstUserMessage({
            content: parsedInput.message,
            userId: parsedInput.userId,
          });

        resolvedConversationId = createdConversation.conversationId;
      } catch (error) {
        throw new CreateChatResponseError({
          cause: error,
          code: "upstream_request_failed",
          message: getDetailedErrorMessage(error),
        });
      }
    } else {
      try {
        history =
          await deps.conversationStore.findConversationHistoryForUserById(
            parsedInput.userId,
            resolvedConversationId,
          );
      } catch (error) {
        throw new CreateChatResponseError({
          cause: error,
          code: "upstream_request_failed",
          message: getDetailedErrorMessage(error),
        });
      }

      if (!history) {
        throw new CreateChatResponseError({
          code: "conversation_not_found",
          message: `Conversation ${resolvedConversationId} was not found for the current user.`,
        });
      }
    }

    let response;

    try {
      await assertActiveVectorStoreReady(deps);

      response = await deps.openAI.createResponse(
        buildCreateResponseParams(
          deps,
          history,
          resolvedConversationId,
          parsedInput.message,
        ),
      );
    } catch (error) {
      if (error instanceof CreateChatResponseError) {
        throw error;
      }

      throw new CreateChatResponseError({
        cause: error,
        code: getCreateChatResponseUpstreamErrorCode(error),
        message: getDetailedErrorMessage(error),
      });
    }

    const citations = await getResponseCitations(
      deps.catalogStore,
      response,
      deps.activeVectorStoreId,
    );
    const messageId = getResponseId(response);
    const text = getResponseText(response);

    try {
      if (isNewConversation) {
        await deps.conversationStore.persistAssistantMessageWithCitations({
          citations,
          content: text,
          conversationId: resolvedConversationId,
          providerMessageId: messageId,
          userId: parsedInput.userId,
        });
      } else {
        await deps.conversationStore.persistConversationTurnWithCitations({
          assistantContent: text,
          assistantProviderMessageId: messageId,
          citations,
          conversationId: resolvedConversationId,
          userContent: parsedInput.message,
          userId: parsedInput.userId,
        });
      }
    } catch (error) {
      throw new CreateChatResponseError({
        cause: error,
        code: "upstream_request_failed",
        message: getDetailedErrorMessage(error),
      });
    }

    return {
      citations,
      conversationId: resolvedConversationId,
      grounded: citations.length > 0,
      messageId,
      text,
    };
  };
}
