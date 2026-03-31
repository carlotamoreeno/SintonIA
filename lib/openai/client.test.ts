import { describe, expect, it, vi } from "vitest";

const openAIConstructorMock = vi.fn(function OpenAIMock() {
  return {
    files: {},
    responses: {},
    vectorStores: {},
  };
});

vi.mock("openai", () => ({
  default: openAIConstructorMock,
}));

vi.mock("./env", () => ({
  openAIServerEnv: {
    activeVectorStoreId: "vs_test_active",
    apiKey: "sk-test-key",
    model: "gpt-5-nano",
    timeoutMs: 45000,
    vectorStoreFileChunkingStrategy: {
      type: "auto",
    },
  },
}));

describe("createOpenAIClient", () => {
  it("creates a server-only client with bounded retries and timeout", async () => {
    const { createOpenAIClient, OPENAI_MAX_RETRIES } = await import("./client");

    const client = createOpenAIClient({
      apiKey: "sk-test-key",
      timeoutMs: 45000,
    });

    expect(client).toEqual({
      files: {},
      responses: {},
      vectorStores: {},
    });
    expect(openAIConstructorMock).toHaveBeenCalledWith({
      apiKey: "sk-test-key",
      timeout: 45000,
      maxRetries: OPENAI_MAX_RETRIES,
    });
  });
});
