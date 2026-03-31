import OpenAI from "openai";
import { describe, expect, it, vi } from "vitest";

vi.mock("./client", () => ({
  openAIClient: {
    files: {
      create: vi.fn(),
      delete: vi.fn(),
      retrieve: vi.fn(),
      waitForProcessing: vi.fn(),
    },
    responses: {
      create: vi.fn(),
    },
    vectorStores: {
      create: vi.fn(),
      delete: vi.fn(),
      retrieve: vi.fn(),
      search: vi.fn(),
      files: {
        create: vi.fn(),
        retrieve: vi.fn(),
      },
    },
  },
}));

import {
  createOpenAIAdapter,
  OpenAIAdapterError,
  toOpenAIAdapterError,
  type OpenAIAdapterClient,
} from "./adapter";

function createMockClient() {
  return {
    files: {
      create: vi.fn(),
      delete: vi.fn(),
      retrieve: vi.fn(),
      waitForProcessing: vi.fn(),
    },
    responses: {
      create: vi.fn(),
    },
    vectorStores: {
      create: vi.fn(),
      delete: vi.fn(),
      retrieve: vi.fn(),
      search: vi.fn(),
      files: {
        create: vi.fn(),
        retrieve: vi.fn(),
      },
    },
  } satisfies OpenAIAdapterClient;
}

describe("createOpenAIAdapter", () => {
  it("delegates response creation without reshaping the SDK result", async () => {
    const client = createMockClient();
    const expectedResponse = {
      _request_id: "req_response_123",
      id: "resp_123",
      object: "response",
    };
    client.responses.create.mockResolvedValue(expectedResponse as never);
    const adapter = createOpenAIAdapter(client);

    const result = await adapter.createResponse({
      input: "Hola",
      model: "gpt-5-nano",
    } as never);

    expect(client.responses.create).toHaveBeenCalledWith(
      {
        input: "Hola",
        model: "gpt-5-nano",
      },
      undefined,
    );
    expect(result).toBe(expectedResponse);
  });

  it("delegates file creation without reshaping the SDK result", async () => {
    const client = createMockClient();
    const expectedFile = {
      _request_id: "req_file_123",
      filename: "manual.pdf",
      id: "file_123",
      object: "file",
      purpose: "user_data",
    };
    client.files.create.mockResolvedValue(expectedFile as never);
    const adapter = createOpenAIAdapter(client);

    const result = await adapter.createFile({
      file: "file-stream",
      purpose: "user_data",
    } as never);

    expect(client.files.create).toHaveBeenCalledWith(
      {
        file: "file-stream",
        purpose: "user_data",
      },
      undefined,
    );
    expect(result).toBe(expectedFile);
  });

  it("delegates file retrieval without reshaping the SDK result", async () => {
    const client = createMockClient();
    const expectedFile = {
      _request_id: "req_file_retrieve_123",
      filename: "manual.pdf",
      id: "file_123",
      object: "file",
      purpose: "assistants",
      status: "processed",
    };
    client.files.retrieve.mockResolvedValue(expectedFile as never);
    const adapter = createOpenAIAdapter(client);

    const result = await adapter.retrieveFile("file_123");

    expect(client.files.retrieve).toHaveBeenCalledWith("file_123", undefined);
    expect(result).toBe(expectedFile);
  });

  it("delegates file deletion without reshaping the SDK result", async () => {
    const client = createMockClient();
    const expectedDeletion = {
      _request_id: "req_file_delete_123",
      deleted: true,
      id: "file_123",
      object: "file",
    };
    client.files.delete.mockResolvedValue(expectedDeletion as never);
    const adapter = createOpenAIAdapter(client);

    const result = await adapter.deleteFile("file_123");

    expect(client.files.delete).toHaveBeenCalledWith("file_123", undefined);
    expect(result).toBe(expectedDeletion);
  });

  it("delegates file processing polling without reshaping the SDK result", async () => {
    const client = createMockClient();
    const expectedFile = {
      _request_id: "req_file_poll_123",
      filename: "manual.pdf",
      id: "file_123",
      object: "file",
      purpose: "assistants",
      status: "processed",
    };
    client.files.waitForProcessing.mockResolvedValue(expectedFile as never);
    const adapter = createOpenAIAdapter(client);

    const result = await adapter.waitForFileProcessing("file_123", {
      maxWait: 60_000,
      pollInterval: 1_000,
    });

    expect(client.files.waitForProcessing).toHaveBeenCalledWith("file_123", {
      maxWait: 60_000,
      pollInterval: 1_000,
    });
    expect(result).toBe(expectedFile);
  });

  it("delegates vector store creation without reshaping the SDK result", async () => {
    const client = createMockClient();
    const expectedVectorStore = {
      _request_id: "req_vs_123",
      id: "vs_123",
      name: "Dataset local-dev",
      object: "vector_store",
    };
    client.vectorStores.create.mockResolvedValue(expectedVectorStore as never);
    const adapter = createOpenAIAdapter(client);

    const result = await adapter.createVectorStore({
      name: "Dataset local-dev",
    } as never);

    expect(client.vectorStores.create).toHaveBeenCalledWith(
      {
        name: "Dataset local-dev",
      },
      undefined,
    );
    expect(result).toBe(expectedVectorStore);
  });

  it("delegates vector store retrieval without reshaping the SDK result", async () => {
    const client = createMockClient();
    const expectedVectorStore = {
      _request_id: "req_vs_retrieve_123",
      id: "vs_123",
      name: "sintonia-mvp-2026-03",
      object: "vector_store",
    };
    client.vectorStores.retrieve.mockResolvedValue(
      expectedVectorStore as never,
    );
    const adapter = createOpenAIAdapter(client);

    const result = await adapter.retrieveVectorStore("vs_123");

    expect(client.vectorStores.retrieve).toHaveBeenCalledWith(
      "vs_123",
      undefined,
    );
    expect(result).toBe(expectedVectorStore);
  });

  it("delegates vector store deletion without reshaping the SDK result", async () => {
    const client = createMockClient();
    const expectedDeletion = {
      _request_id: "req_vs_delete_123",
      deleted: true,
      id: "vs_123",
      object: "vector_store.deleted",
    };
    client.vectorStores.delete.mockResolvedValue(expectedDeletion as never);
    const adapter = createOpenAIAdapter(client);

    const result = await adapter.deleteVectorStore("vs_123");

    expect(client.vectorStores.delete).toHaveBeenCalledWith(
      "vs_123",
      undefined,
    );
    expect(result).toBe(expectedDeletion);
  });

  it("delegates vector store file creation without reshaping the SDK result", async () => {
    const client = createMockClient();
    const expectedVectorStoreFile = {
      _request_id: "req_vsf_123",
      id: "vs_file_123",
      object: "vector_store.file",
      vector_store_id: "vs_123",
    };
    client.vectorStores.files.create.mockResolvedValue(
      expectedVectorStoreFile as never,
    );
    const adapter = createOpenAIAdapter(client);

    const result = await adapter.createVectorStoreFile("vs_123", {
      file_id: "file_123",
    } as never);

    expect(client.vectorStores.files.create).toHaveBeenCalledWith(
      "vs_123",
      {
        file_id: "file_123",
      },
      undefined,
    );
    expect(result).toBe(expectedVectorStoreFile);
  });

  it("delegates vector store file retrieval without reshaping the SDK result", async () => {
    const client = createMockClient();
    const expectedVectorStoreFile = {
      _request_id: "req_vsf_retrieve_123",
      id: "vs_file_123",
      object: "vector_store.file",
      status: "completed",
      vector_store_id: "vs_123",
    };
    client.vectorStores.files.retrieve.mockResolvedValue(
      expectedVectorStoreFile as never,
    );
    const adapter = createOpenAIAdapter(client);

    const result = await adapter.retrieveVectorStoreFile("vs_123", "file_123");

    expect(client.vectorStores.files.retrieve).toHaveBeenCalledWith(
      "file_123",
      {
        vector_store_id: "vs_123",
      },
      undefined,
    );
    expect(result).toBe(expectedVectorStoreFile);
  });

  it("delegates vector store search without reshaping the SDK result", async () => {
    const client = createMockClient();
    const expectedSearchResult = {
      data: [
        {
          attributes: {
            doc_id: "botanica-mvp-v1-corpus-mvp",
          },
          content: [
            {
              text: "Fragmento botánico",
              type: "text",
            },
          ],
          file_id: "file_123",
          filename: "manual.pdf",
          score: 0.98,
        },
      ],
      object: "list",
    };
    client.vectorStores.search.mockResolvedValue(expectedSearchResult as never);
    const adapter = createOpenAIAdapter(client);

    const result = await adapter.searchVectorStore("vs_123", {
      query: "botanica",
    } as never);

    expect(client.vectorStores.search).toHaveBeenCalledWith(
      "vs_123",
      {
        query: "botanica",
      },
      undefined,
    );
    expect(result).toBe(expectedSearchResult);
  });

  it("wraps upstream SDK failures in an OpenAIAdapterError", async () => {
    const client = createMockClient();
    client.responses.create.mockRejectedValue(
      new OpenAI.APIConnectionTimeoutError({
        message: "The request timed out.",
      }),
    );
    const adapter = createOpenAIAdapter(client);

    await expect(
      adapter.createResponse({
        input: "Hola",
        model: "gpt-5-nano",
      } as never),
    ).rejects.toMatchObject({
      message: "The request timed out.",
      name: "OpenAIAdapterError",
      retryable: true,
    });
  });
});

describe("toOpenAIAdapterError", () => {
  it("normalizes OpenAI API errors with status, request id and retryability", () => {
    const upstream = new OpenAI.RateLimitError(
      429,
      {
        code: "rate_limit",
        message: "Too many requests",
        type: "rate_limit_error",
      },
      "Too many requests",
      new Headers({
        "x-request-id": "req_rate_limit_123",
      }),
    );

    const error = toOpenAIAdapterError(upstream);

    expect(error).toBeInstanceOf(OpenAIAdapterError);
    expect(error).toMatchObject({
      code: "rate_limit",
      message: "429 Too many requests",
      requestId: "req_rate_limit_123",
      retryable: true,
      status: 429,
      type: "rate_limit_error",
    });
    expect(error.cause).toBe(upstream);
  });

  it("wraps unknown errors without losing the original cause", () => {
    const upstream = new Error("Boom");

    const error = toOpenAIAdapterError(upstream);

    expect(error).toBeInstanceOf(OpenAIAdapterError);
    expect(error).toMatchObject({
      message: "Boom",
      retryable: false,
    });
    expect(error.cause).toBe(upstream);
  });
});
