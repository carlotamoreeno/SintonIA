import { describe, expect, it } from "vitest";
import {
  DEFAULT_CHAT_MAX_HISTORY_TURNS,
  DEFAULT_CHAT_MAX_MESSAGE_CHARS,
  DEFAULT_CHAT_MAX_OUTPUT_TOKENS,
  DEFAULT_CHAT_RATE_LIMIT_PER_MIN,
  parseChatRuntimeEnv,
} from "./env";

describe("parseChatRuntimeEnv", () => {
  it("returns the documented defaults when runtime caps are omitted", () => {
    expect(parseChatRuntimeEnv({})).toEqual({
      maxHistoryTurns: DEFAULT_CHAT_MAX_HISTORY_TURNS,
      maxMessageChars: DEFAULT_CHAT_MAX_MESSAGE_CHARS,
      maxOutputTokens: DEFAULT_CHAT_MAX_OUTPUT_TOKENS,
      rateLimitPerMinute: DEFAULT_CHAT_RATE_LIMIT_PER_MIN,
    });
  });

  it("parses explicit runtime cap overrides", () => {
    expect(
      parseChatRuntimeEnv({
        CHAT_MAX_HISTORY_TURNS: "8",
        CHAT_MAX_MESSAGE_CHARS: "3000",
        CHAT_MAX_OUTPUT_TOKENS: "600",
        CHAT_RATE_LIMIT_PER_MIN: "15",
      }),
    ).toEqual({
      maxHistoryTurns: 8,
      maxMessageChars: 3000,
      maxOutputTokens: 600,
      rateLimitPerMinute: 15,
    });
  });

  it("rejects non-positive history caps", () => {
    expect(() =>
      parseChatRuntimeEnv({
        CHAT_MAX_HISTORY_TURNS: "0",
      }),
    ).toThrow();
  });

  it("rejects non-positive output caps", () => {
    expect(() =>
      parseChatRuntimeEnv({
        CHAT_MAX_OUTPUT_TOKENS: "-1",
      }),
    ).toThrow();
  });

  it("rejects non-positive rate limits", () => {
    expect(() =>
      parseChatRuntimeEnv({
        CHAT_RATE_LIMIT_PER_MIN: "0",
      }),
    ).toThrow();
  });
});
