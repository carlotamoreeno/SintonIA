import { z } from "zod";
import { DEFAULT_CHAT_MAX_MESSAGE_CHARS } from "./env";

export const INVALID_CHAT_REQUEST_MESSAGE = "Invalid request payload";
export const INVALID_CHAT_CONVERSATION_ID_MESSAGE = "Invalid conversationId.";
export const UPSTREAM_CHAT_ERROR_MESSAGE = "Upstream chat request failed.";

export const chatRequestBodySchema = z.object({
  conversationId: z
    .string()
    .trim()
    .min(1, "ConversationId must not be empty.")
    .optional(),
  message: z
    .string()
    .trim()
    .min(1, "Message must not be empty.")
    .max(
      DEFAULT_CHAT_MAX_MESSAGE_CHARS,
      `Message must not exceed ${DEFAULT_CHAT_MAX_MESSAGE_CHARS} characters.`,
    ),
});

export type ChatRequestBody = z.infer<typeof chatRequestBodySchema>;

export type ChatRequestIssues = Partial<
  Record<keyof ChatRequestBody, string[] | undefined>
>;

export function buildInvalidChatRequestPayload(issues: ChatRequestIssues = {}) {
  return {
    message: INVALID_CHAT_REQUEST_MESSAGE,
    issues,
  };
}

export function buildInvalidChatRequestPayloadFromZodError(
  error: z.ZodError<ChatRequestBody>,
) {
  const fieldErrors = error.flatten().fieldErrors;

  return buildInvalidChatRequestPayload({
    conversationId: fieldErrors.conversationId,
    message: fieldErrors.message,
  });
}
