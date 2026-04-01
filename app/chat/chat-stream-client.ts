"use client";

import type { ChatStreamEvent } from "@/lib/chat/chat-stream";

function parseChatStreamEventBlock(block: string): ChatStreamEvent | null {
  const lines = block.split("\n");
  const eventLine = lines.find((line) => line.startsWith("event:"));
  const dataLines = lines.filter((line) => line.startsWith("data:"));

  if (!eventLine || dataLines.length === 0) {
    return null;
  }

  const eventType = eventLine.slice("event:".length).trim();
  const rawData = dataLines
    .map((line) => line.slice("data:".length).trim())
    .join("\n");

  try {
    const parsedData = JSON.parse(rawData) as ChatStreamEvent;

    if (parsedData.type !== eventType) {
      return null;
    }

    return parsedData;
  } catch {
    return null;
  }
}

export async function readChatEventStream(
  response: Response,
  onEvent: (event: ChatStreamEvent) => void,
) {
  if (!response.body) {
    throw new Error("Streaming response did not include a readable body.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();

    buffer += decoder.decode(value, {
      stream: !done,
    });

    const blocks = buffer.split("\n\n");
    buffer = blocks.pop() ?? "";

    for (const block of blocks) {
      const event = parseChatStreamEventBlock(block.trim());

      if (event) {
        onEvent(event);
      }
    }

    if (done) {
      const trailingEvent = parseChatStreamEventBlock(buffer.trim());

      if (trailingEvent) {
        onEvent(trailingEvent);
      }

      break;
    }
  }
}
