import { NextResponse } from "next/server";
import { UNAUTHENTICATED_API_MESSAGE } from "@/lib/auth/access";
import { getOptionalAppSession } from "@/lib/auth/app-session";
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
