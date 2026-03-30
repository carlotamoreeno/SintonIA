import { describe, expect, it } from "vitest";

process.env.OPENAI_API_KEY ??= "sk-test-key";
process.env.OPENAI_ACTIVE_VECTOR_STORE_ID ??= "vs_test_active";

async function loadEnvModule() {
  return import("./env");
}

describe("parseOpenAIServerEnv", () => {
  it("defaults the locked MVP model when it is omitted", async () => {
    const {
      DEFAULT_OPENAI_MODEL,
      DEFAULT_OPENAI_TIMEOUT_MS,
      parseOpenAIServerEnv,
    } = await loadEnvModule();

    expect(
      parseOpenAIServerEnv({
        OPENAI_ACTIVE_VECTOR_STORE_ID: "vs_active_test",
        OPENAI_API_KEY: "sk-test-key",
      }),
    ).toEqual({
      activeVectorStoreId: "vs_active_test",
      apiKey: "sk-test-key",
      model: DEFAULT_OPENAI_MODEL,
      timeoutMs: DEFAULT_OPENAI_TIMEOUT_MS,
    });
  });

  it("accepts an explicit model override and normalizes the configured timeout", async () => {
    const { parseOpenAIServerEnv } = await loadEnvModule();

    expect(
      parseOpenAIServerEnv({
        OPENAI_ACTIVE_VECTOR_STORE_ID: "vs_active_test",
        OPENAI_API_KEY: "sk-test-key",
        OPENAI_MODEL: "gpt-5-mini-custom",
        OPENAI_TIMEOUT_MS: "45000",
      }),
    ).toEqual({
      activeVectorStoreId: "vs_active_test",
      apiKey: "sk-test-key",
      model: "gpt-5-mini-custom",
      timeoutMs: 45000,
    });
  });

  it("rejects an empty API key", async () => {
    const { parseOpenAIServerEnv } = await loadEnvModule();

    expect(() =>
      parseOpenAIServerEnv({
        OPENAI_ACTIVE_VECTOR_STORE_ID: "vs_active_test",
        OPENAI_API_KEY: "",
      }),
    ).toThrowError(/OPENAI_API_KEY/i);
  });

  it("requires an active vector store id", async () => {
    const { parseOpenAIServerEnv } = await loadEnvModule();

    expect(() =>
      parseOpenAIServerEnv({
        OPENAI_API_KEY: "sk-test-key",
      }),
    ).toThrowError(/OPENAI_ACTIVE_VECTOR_STORE_ID/i);
  });

  it("rejects a blank model override", async () => {
    const { parseOpenAIServerEnv } = await loadEnvModule();

    expect(() =>
      parseOpenAIServerEnv({
        OPENAI_ACTIVE_VECTOR_STORE_ID: "vs_active_test",
        OPENAI_API_KEY: "sk-test-key",
        OPENAI_MODEL: "   ",
      }),
    ).toThrowError(/OPENAI_MODEL/i);
  });

  it("rejects a blank active vector store id", async () => {
    const { parseOpenAIServerEnv } = await loadEnvModule();

    expect(() =>
      parseOpenAIServerEnv({
        OPENAI_ACTIVE_VECTOR_STORE_ID: "   ",
        OPENAI_API_KEY: "sk-test-key",
      }),
    ).toThrowError(/OPENAI_ACTIVE_VECTOR_STORE_ID/i);
  });

  it("rejects a timeout that is not a positive integer", async () => {
    const { parseOpenAIServerEnv } = await loadEnvModule();

    expect(() =>
      parseOpenAIServerEnv({
        OPENAI_ACTIVE_VECTOR_STORE_ID: "vs_active_test",
        OPENAI_API_KEY: "sk-test-key",
        OPENAI_TIMEOUT_MS: "0",
      }),
    ).toThrowError(/OPENAI_TIMEOUT_MS/i);
  });
});
