import type { CreateChatResponseResult } from "./create-chat-response-core";

export const CHAT_STREAM_CONTENT_TYPE = "text/event-stream; charset=utf-8";
export const CHAT_STREAM_ACCEPT_HEADER = "text/event-stream";

export type ChatConversationStreamEvent = {
  conversationId: string;
  type: "conversation";
};

export type ChatAssistantDeltaStreamEvent = {
  delta: string;
  type: "assistant_delta";
};

export type ChatDoneStreamEvent = CreateChatResponseResult & {
  type: "done";
};

export type ChatErrorStreamEvent = {
  message: string;
  type: "error";
};

export type ChatStreamEvent =
  | ChatConversationStreamEvent
  | ChatAssistantDeltaStreamEvent
  | ChatDoneStreamEvent
  | ChatErrorStreamEvent;

export function isChatStreamingRequest(request: Request) {
  return request.headers.get("accept")?.includes(CHAT_STREAM_ACCEPT_HEADER);
}

export function serializeChatStreamEvent(event: ChatStreamEvent) {
  return `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}
