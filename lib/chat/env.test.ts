import { describe, expect, it } from "vitest";
import {
  DEFAULT_CHAT_MAX_HISTORY_TURNS,
  DEFAULT_CHAT_MAX_MESSAGE_CHARS,
  DEFAULT_CHAT_MAX_OUTPUT_TOKENS,
  DEFAULT_CHAT_RATE_LIMIT_PER_MIN,
  parseChatRuntimeEnv,
} from "./env";
import {
  MAX_CHAT_HISTORY_TURNS,
  MAX_CHAT_MESSAGE_CHARS,
  MAX_CHAT_OUTPUT_TOKENS,
} from "./limits";

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

  it("rejects history caps above the committed maximum", () => {
    expect(() =>
      parseChatRuntimeEnv({
        CHAT_MAX_HISTORY_TURNS: String(MAX_CHAT_HISTORY_TURNS + 1),
      }),
    ).toThrow();
  });

  it("rejects message caps above the committed maximum", () => {
    expect(() =>
      parseChatRuntimeEnv({
        CHAT_MAX_MESSAGE_CHARS: String(MAX_CHAT_MESSAGE_CHARS + 1),
      }),
    ).toThrow();
  });

  it("rejects output caps above the committed maximum", () => {
    expect(() =>
      parseChatRuntimeEnv({
        CHAT_MAX_OUTPUT_TOKENS: String(MAX_CHAT_OUTPUT_TOKENS + 1),
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
