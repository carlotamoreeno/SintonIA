import {
  CreateChatResponseError,
  type CreateChatResponseConversationDeps,
  type CreateChatResponseInput,
  type CreateChatResponseRequestConfig,
  type CreateChatResponseResult,
  type ResolvedCreateChatConversationContext,
  assertActiveVectorStoreReady,
  buildCreateResponseParams,
  getCreateChatResponseUpstreamErrorCode,
  getDetailedErrorMessage,
  getResponseCitations,
  getResponseId,
  persistCreateChatResponseResult,
  resolveAssistantText,
  resolveCreateChatConversationContext,
} from "./create-chat-response-core";

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
  stream: ReturnType<CreateChatResponseStreamClient["streamResponse"]>;
};

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

    return {
      context,
      async finalize() {
        let response;

        try {
          response = await stream.finalResponse();
        } catch (error) {
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
        const text = resolveAssistantText(response);

        await persistCreateChatResponseResult(deps, {
          citations,
          context,
          messageId,
          text,
        });

        return {
          citations,
          conversationId: context.resolvedConversationId,
          grounded: citations.length > 0,
          messageId,
          text,
        };
      },
      stream,
    };
  };
}
