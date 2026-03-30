import { describe, expect, it } from "vitest";
import { DEFAULT_OPENAI_TIMEOUT_MS, parseOpenAIServerEnv } from "./env";

describe("parseOpenAIServerEnv", () => {
  it("accepts a valid API key and defaults the timeout", () => {
    expect(
      parseOpenAIServerEnv({
        OPENAI_API_KEY: "sk-test-key",
      }),
    ).toEqual({
      apiKey: "sk-test-key",
      timeoutMs: DEFAULT_OPENAI_TIMEOUT_MS,
    });
  });

  it("normalizes the configured timeout when provided", () => {
    expect(
      parseOpenAIServerEnv({
        OPENAI_API_KEY: "sk-test-key",
        OPENAI_TIMEOUT_MS: "45000",
      }),
    ).toEqual({
      apiKey: "sk-test-key",
      timeoutMs: 45000,
    });
  });

  it("rejects an empty API key", () => {
    expect(() =>
      parseOpenAIServerEnv({
        OPENAI_API_KEY: "",
      }),
    ).toThrowError(/OPENAI_API_KEY/i);
  });

  it("rejects a timeout that is not a positive integer", () => {
    expect(() =>
      parseOpenAIServerEnv({
        OPENAI_API_KEY: "sk-test-key",
        OPENAI_TIMEOUT_MS: "0",
      }),
    ).toThrowError(/OPENAI_TIMEOUT_MS/i);
  });
});
