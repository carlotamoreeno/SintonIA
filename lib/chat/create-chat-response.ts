import "server-only";

export type CreateChatResponseInput = {
  conversationId?: string;
  message: string;
  userId: string;
};

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

export async function createChatResponse(
  input: CreateChatResponseInput,
): Promise<CreateChatResponseResult> {
  void input;

  throw new CreateChatResponseError({
    code: "upstream_request_failed",
    message: "Chat runtime not implemented yet.",
  });
}
