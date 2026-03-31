import { z } from "zod";
import {
  OpenAIAdapterError,
  type OpenAIAdapter,
  type OpenAIResponsesCreateResult,
} from "@/lib/openai/adapter-core";
import type { ConversationStore } from "@/lib/supabase/conversation-store";
import { chatRequestBodySchema } from "./chat-route";

const createChatResponseInputSchema = chatRequestBodySchema.extend({
  userId: z.string().trim().min(1),
});

type CreateChatResponseClient = Pick<OpenAIAdapter, "createResponse">;

export type CreateChatResponseInput = z.input<
  typeof createChatResponseInputSchema
>;

export type CreateChatResponseResult = {
  citations: [];
  conversationId: string;
  grounded: false;
  messageId: string;
  text: string;
};

export type CreateChatResponseErrorCode =
  | "conversation_not_found"
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
  conversationStore: Pick<
    ConversationStore,
    | "createConversationWithFirstUserMessage"
    | "findConversationHistoryForUserById"
  >;
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

function buildConversationInput(
  history: Awaited<
    ReturnType<ConversationStore["findConversationHistoryForUserById"]>
  >,
  message: string,
) {
  if (!history || history.messages.length === 0) {
    return message;
  }

  return [
    "Conversation history:",
    ...history.messages.map(
      (entry) => `${entry.role.toUpperCase()}: ${entry.content}`,
    ),
    "",
    `USER: ${message}`,
  ].join("\n");
}

function isNonStreamingResponse(
  response: OpenAIResponsesCreateResult,
): response is Extract<OpenAIResponsesCreateResult, { id: string }> {
  return (
    typeof response === "object" &&
    response !== null &&
    "id" in response &&
    typeof response.id === "string" &&
    "output_text" in response
  );
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

    let resolvedConversationId = parsedInput.conversationId;
    let history = null;

    if (!resolvedConversationId) {
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
      response = await deps.openAI.createResponse({
        input: buildConversationInput(history, parsedInput.message),
        model: deps.model,
        store: false,
      });
    } catch (error) {
      throw new CreateChatResponseError({
        cause: error,
        code: "upstream_request_failed",
        message: getDetailedErrorMessage(error),
      });
    }

    return {
      citations: [],
      conversationId: resolvedConversationId,
      grounded: false,
      messageId: getResponseId(response),
      text: getResponseText(response),
    };
  };
}
