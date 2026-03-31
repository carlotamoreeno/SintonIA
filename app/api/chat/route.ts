import { NextResponse } from "next/server";
import { UNAUTHENTICATED_API_MESSAGE } from "@/lib/auth/access";
import { getOptionalAppSession } from "@/lib/auth/app-session";
import {
  buildInvalidChatRequestPayload,
  buildInvalidChatRequestPayloadFromZodError,
  chatRequestBodySchema,
  INVALID_CHAT_CONVERSATION_ID_MESSAGE,
  UPSTREAM_CHAT_ERROR_MESSAGE,
} from "@/lib/chat/chat-route";
import {
  createChatResponse,
  CreateChatResponseError,
} from "@/lib/chat/create-chat-response";

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

    return NextResponse.json(
      {
        message: UPSTREAM_CHAT_ERROR_MESSAGE,
      },
      { status: 502 },
    );
  }
}
