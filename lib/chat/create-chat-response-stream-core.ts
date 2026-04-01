import {
  CreateChatResponseError,
  type CreateChatResponseConversationDeps,
  type CreateChatResponseInput,
  type CreateChatResponseRequestConfig,
  type CreateChatResponseResult,
  type ResolvedOpenAIChatResponse,
  type ResolvedCreateChatConversationContext,
  assertActiveVectorStoreReady,
  buildConversationInput,
  buildCreateResponseParams,
  buildCreateResponseParamsFromInput,
  getCreateChatResponseUpstreamErrorCode,
  getDetailedErrorMessage,
  persistCreateChatResponseResult,
  resolveOpenAIChatResponse,
  resolveCreateChatConversationContext,
} from "./create-chat-response-core";
import {
  appendTruncationNotice,
  CHAT_RESPONSE_TRUNCATED_CONTINUATION_PROMPT,
  getSanitizedDeltaFromSnapshot,
  mergeAssistantTexts,
} from "./assistant-text";

export type CreateChatResponseStreamClient = {
  retrieveVectorStore: typeof import("@/lib/openai/adapter").openAIAdapter.retrieveVectorStore;
  streamResponse: typeof import("@/lib/openai/adapter").openAIAdapter.streamResponse;
};

export type CreateChatResponseStreamDeps = CreateChatResponseConversationDeps &
  CreateChatResponseRequestConfig & {
    catalogStore: {
      findDocumentByIdentity: typeof import("@/lib/supabase/knowledge-document-store").knowledgeDocumentCatalogStore.findDocumentByIdentity;
    };
    openAI: CreateChatResponseStreamClient;
  };

export type PreparedChatResponseStream = {
  context: ResolvedCreateChatConversationContext;
  finalize(): Promise<CreateChatResponseResult>;
  stream: AsyncIterable<{
    delta: string;
    type: "response.output_text.delta";
  }>;
};

function buildContinuationInput(
  history: ResolvedCreateChatConversationContext["history"],
  maxHistoryTurns: number,
  message: string,
  partialAssistantText: string,
) {
  return [
    buildConversationInput(history, maxHistoryTurns, message),
    `ASSISTANT: ${partialAssistantText}`,
    `USER: ${CHAT_RESPONSE_TRUNCATED_CONTINUATION_PROMPT}`,
  ].join("\n");
}

function mergeChatCitations(
  existingCitations: ResolvedOpenAIChatResponse["citations"],
  nextCitations: ResolvedOpenAIChatResponse["citations"],
) {
  const seenFileIds = new Set(
    existingCitations.map((citation) => citation.fileId),
  );
  const mergedCitations = [...existingCitations];

  for (const citation of nextCitations) {
    if (seenFileIds.has(citation.fileId)) {
      continue;
    }

    seenFileIds.add(citation.fileId);
    mergedCitations.push(citation);
  }

  return mergedCitations;
}

function createAsyncIterableQueue<T>() {
  const values: T[] = [];
  const waiters: Array<() => void> = [];
  let closed = false;

  const notify = () => {
    const waiter = waiters.shift();
    waiter?.();
  };

  return {
    close() {
      closed = true;
      notify();
    },
    push(value: T) {
      if (closed) {
        return;
      }

      values.push(value);
      notify();
    },
    async *[Symbol.asyncIterator]() {
      while (values.length > 0 || !closed) {
        if (values.length === 0) {
          await new Promise<void>((resolve) => {
            waiters.push(resolve);
          });
          continue;
        }

        const nextValue = values.shift();

        if (nextValue !== undefined) {
          yield nextValue;
        }
      }
    },
  };
}

export function createCreateChatResponseStream(
  deps: CreateChatResponseStreamDeps,
) {
  return async function createChatResponseStream(
    input: CreateChatResponseInput,
  ): Promise<PreparedChatResponseStream> {
    const context = await resolveCreateChatConversationContext(deps, input);

    await assertActiveVectorStoreReady(deps);

    let stream;

    try {
      stream = deps.openAI.streamResponse({
        ...buildCreateResponseParams(
          deps,
          context.history,
          context.resolvedConversationId,
          context.parsedInput.message,
        ),
        stream: true,
      });
    } catch (error) {
      throw new CreateChatResponseError({
        cause: error,
        code: getCreateChatResponseUpstreamErrorCode(error),
        message: getDetailedErrorMessage(error),
      });
    }

    let executionPromise: Promise<CreateChatResponseResult> | null = null;

    const executeStream = async (
      onDelta?: (event: {
        delta: string;
        type: "response.output_text.delta";
      }) => void,
    ) => {
      let currentStream = stream;
      let mergedResponse: ResolvedOpenAIChatResponse | null = null;
      let shouldAttemptContinuation = true;

      while (true) {
        let previousVisibleText = "";

        for await (const event of currentStream) {
          if (event.type !== "response.output_text.delta") {
            continue;
          }

          const snapshot =
            typeof (event as { snapshot?: string }).snapshot === "string"
              ? (event as unknown as { snapshot: string }).snapshot
              : null;
          const rawSnapshot =
            snapshot ?? `${previousVisibleText}${event.delta}`;
          const sanitizedDelta = getSanitizedDeltaFromSnapshot(
            previousVisibleText,
            rawSnapshot,
          );

          previousVisibleText = sanitizedDelta.nextVisibleText;

          if (sanitizedDelta.delta.length > 0) {
            onDelta?.({
              delta: sanitizedDelta.delta,
              type: "response.output_text.delta",
            });
          }
        }

        let finalResponse;

        try {
          finalResponse = await currentStream.finalResponse();
        } catch (error) {
          throw new CreateChatResponseError({
            cause: error,
            code: getCreateChatResponseUpstreamErrorCode(error),
            message: getDetailedErrorMessage(error),
          });
        }

        const resolvedResponse = await resolveOpenAIChatResponse(
          deps,
          finalResponse,
        );

        mergedResponse = mergedResponse
          ? {
              citations: mergeChatCitations(
                mergedResponse.citations,
                resolvedResponse.citations,
              ),
              incompleteReason: resolvedResponse.incompleteReason,
              messageId: resolvedResponse.messageId,
              text: mergeAssistantTexts(
                mergedResponse.text,
                resolvedResponse.text,
              ),
            }
          : resolvedResponse;

        if (
          resolvedResponse.incompleteReason !== "max_output_tokens" ||
          !shouldAttemptContinuation
        ) {
          break;
        }

        shouldAttemptContinuation = false;

        try {
          currentStream = deps.openAI.streamResponse({
            ...buildCreateResponseParamsFromInput(
              deps,
              buildContinuationInput(
                context.history,
                deps.maxHistoryTurns,
                context.parsedInput.message,
                mergedResponse.text,
              ),
              context.resolvedConversationId,
            ),
            stream: true,
          });
        } catch (error) {
          throw new CreateChatResponseError({
            cause: error,
            code: getCreateChatResponseUpstreamErrorCode(error),
            message: getDetailedErrorMessage(error),
          });
        }
      }

      if (!mergedResponse) {
        throw new CreateChatResponseError({
          code: "upstream_request_failed",
          message: "OpenAI stream did not produce a final response.",
        });
      }

      const finalizedText =
        mergedResponse.incompleteReason === "max_output_tokens"
          ? appendTruncationNotice(mergedResponse.text)
          : mergedResponse.text;

      await persistCreateChatResponseResult(deps, {
        citations: mergedResponse.citations,
        context,
        messageId: mergedResponse.messageId,
        text: finalizedText,
      });

      return {
        citations: mergedResponse.citations,
        conversationId: context.resolvedConversationId,
        grounded: mergedResponse.citations.length > 0,
        messageId: mergedResponse.messageId,
        text: finalizedText,
      };
    };

    return {
      context,
      async finalize() {
        executionPromise ??= executeStream();

        return executionPromise;
      },
      stream: {
        async *[Symbol.asyncIterator]() {
          const queue = createAsyncIterableQueue<{
            delta: string;
            type: "response.output_text.delta";
          }>();

          executionPromise ??= executeStream((event) => {
            queue.push(event);
          }).finally(() => {
            queue.close();
          });

          yield* queue;
        },
      },
    };
  };
}
