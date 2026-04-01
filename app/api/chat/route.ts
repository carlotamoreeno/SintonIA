import { NextResponse } from "next/server";
import { UNAUTHENTICATED_API_MESSAGE } from "@/lib/auth/access";
import { getOptionalAppSession } from "@/lib/auth/app-session";
import {
  CHAT_STREAM_CONTENT_TYPE,
  isChatStreamingRequest,
  serializeChatStreamEvent,
} from "@/lib/chat/chat-stream";
import {
  buildInvalidChatRequestPayload,
  buildInvalidChatRequestPayloadFromZodError,
  chatRequestBodySchema,
  INVALID_CHAT_CONVERSATION_ID_MESSAGE,
  RATE_LIMITED_CHAT_MESSAGE,
  UPSTREAM_CHAT_ERROR_MESSAGE,
  UPSTREAM_CHAT_TIMEOUT_MESSAGE,
} from "@/lib/chat/chat-route";
import { chatRuntimeEnv } from "@/lib/chat/env";
import {
  createChatResponse,
  CreateChatResponseError,
} from "@/lib/chat/create-chat-response";
import { createChatResponseStream } from "@/lib/chat/create-chat-response-stream";
import { chatRateLimitStore } from "@/lib/supabase/chat-rate-limit-store";

export const dynamic = "force-dynamic";

async function getRequestPayload(request: Request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  const appSession = await getOptionalAppSession();

  if (!appSession?.session.user) {
    return NextResponse.json(
      {
        message: UNAUTHENTICATED_API_MESSAGE,
      },
      { status: 401 },
    );
  }

  const payload = await getRequestPayload(request);
  const parsedBody = chatRequestBodySchema.safeParse(payload);

  if (!parsedBody.success) {
    return NextResponse.json(
      buildInvalidChatRequestPayloadFromZodError(parsedBody.error),
      {
        status: 400,
      },
    );
  }

  try {
    const rateLimit = await chatRateLimitStore.consumeRequest({
      limit: chatRuntimeEnv.rateLimitPerMinute,
      userId: appSession.persistedIdentity.user.id,
    });

    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          message: RATE_LIMITED_CHAT_MESSAGE,
        },
        { status: 429 },
      );
    }
  } catch {
    return NextResponse.json(
      {
        message: UPSTREAM_CHAT_ERROR_MESSAGE,
      },
      { status: 502 },
    );
  }

  try {
    if (isChatStreamingRequest(request)) {
      const preparedStream = await createChatResponseStream({
        conversationId: parsedBody.data.conversationId,
        message: parsedBody.data.message,
        userId: appSession.persistedIdentity.user.id,
      });
      const encoder = new TextEncoder();
      const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
          const enqueueEvent = (
            value: Parameters<typeof serializeChatStreamEvent>[0],
          ) => {
            controller.enqueue(encoder.encode(serializeChatStreamEvent(value)));
          };

          try {
            enqueueEvent({
              conversationId: preparedStream.context.resolvedConversationId,
              type: "conversation",
            });

            for await (const event of preparedStream.stream) {
              if (
                event.type === "response.output_text.delta" &&
                event.delta.length > 0
              ) {
                enqueueEvent({
                  delta: event.delta,
                  type: "assistant_delta",
                });
              }
            }

            const response = await preparedStream.finalize();

            enqueueEvent({
              ...response,
              type: "done",
            });
          } catch (error) {
            enqueueEvent({
              message:
                error instanceof CreateChatResponseError
                  ? error.message
                  : UPSTREAM_CHAT_ERROR_MESSAGE,
              type: "error",
            });
          } finally {
            controller.close();
          }
        },
      });

      return new Response(stream, {
        headers: {
          "cache-control": "no-store",
          "content-type": CHAT_STREAM_CONTENT_TYPE,
        },
        status: 200,
      });
    }

    const response = await createChatResponse({
      conversationId: parsedBody.data.conversationId,
      message: parsedBody.data.message,
      userId: appSession.persistedIdentity.user.id,
    });

    return NextResponse.json(response);
  } catch (error) {
    if (
      error instanceof CreateChatResponseError &&
      error.code === "conversation_not_found"
    ) {
      return NextResponse.json(
        buildInvalidChatRequestPayload({
          conversationId: [INVALID_CHAT_CONVERSATION_ID_MESSAGE],
        }),
        { status: 400 },
      );
    }

    if (
      error instanceof CreateChatResponseError &&
      error.code === "rate_limited"
    ) {
      return NextResponse.json(
        {
          message: RATE_LIMITED_CHAT_MESSAGE,
        },
        { status: 429 },
      );
    }

    if (
      error instanceof CreateChatResponseError &&
      error.code === "upstream_timeout"
    ) {
      return NextResponse.json(
        {
          message: UPSTREAM_CHAT_TIMEOUT_MESSAGE,
        },
        { status: 504 },
      );
    }

    return NextResponse.json(
      {
        message: UPSTREAM_CHAT_ERROR_MESSAGE,
      },
      { status: 502 },
    );
  }
}
