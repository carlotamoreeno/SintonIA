import { describe, expect, it, vi } from "vitest";
import { OpenAIAdapterError } from "@/lib/openai/adapter-core";
import { createCreateChatResponse } from "./create-chat-response-core";

function createDeps() {
  const persistAssistantMessageWithCitations = vi.fn();
  const persistConversationTurnWithCitations = vi.fn();
  const createConversationWithFirstUserMessage = vi.fn();
  const findConversationHistoryForUserById = vi.fn();
  const findDocumentByIdentity = vi.fn();
  const createResponse = vi.fn();
  const retrieveVectorStore = vi.fn();

  return {
    catalogStore: {
      findDocumentByIdentity,
    },
    conversationStore: {
      persistAssistantMessageWithCitations,
      persistConversationTurnWithCitations,
      createConversationWithFirstUserMessage,
      findConversationHistoryForUserById,
    },
    openAI: {
      createResponse,
      retrieveVectorStore,
    },
    spies: {
      createConversationWithFirstUserMessage,
      createResponse,
      findDocumentByIdentity,
      findConversationHistoryForUserById,
      persistAssistantMessageWithCitations,
      persistConversationTurnWithCitations,
      retrieveVectorStore,
    },
  };
}

function createReadyVectorStore() {
  return {
    file_counts: {
      cancelled: 0,
      completed: 1,
      failed: 0,
      in_progress: 0,
      total: 1,
    },
    id: "vs_active_123",
    status: "completed",
  };
}

describe("createCreateChatResponse", () => {
  it("creates a new conversation and sends the first user message to the model", async () => {
    const deps = createDeps();
    deps.spies.createConversationWithFirstUserMessage.mockResolvedValueOnce({
      conversationId: "conversation-1",
      createdAt: "2026-03-31T12:00:00.000Z",
      lastMessageAt: "2026-03-31T12:00:00.000Z",
      messageId: "message-1",
      status: "active",
      title: "Nueva consulta",
      updatedAt: "2026-03-31T12:00:00.000Z",
    });
    deps.spies.retrieveVectorStore.mockResolvedValueOnce(
      createReadyVectorStore(),
    );
    deps.spies.createResponse.mockResolvedValueOnce({
      id: "resp_123",
      output: [],
      output_text: "Respuesta inicial",
    });
    const createChatResponse = createCreateChatResponse({
      activeVectorStoreId: "vs_active_123",
      catalogStore: deps.catalogStore,
      conversationStore: deps.conversationStore,
      maxHistoryTurns: 12,
      maxOutputTokens: 800,
      model: "gpt-5-nano",
      openAI: deps.openAI,
    });

    const result = await createChatResponse({
      message: "  Consulta inicial  ",
      userId: "user-1",
    });

    expect(
      deps.spies.createConversationWithFirstUserMessage,
    ).toHaveBeenCalledWith({
      content: "Consulta inicial",
      userId: "user-1",
    });
    expect(
      deps.spies.findConversationHistoryForUserById,
    ).not.toHaveBeenCalled();
    expect(deps.spies.retrieveVectorStore).toHaveBeenCalledWith(
      "vs_active_123",
    );
    expect(deps.spies.createResponse).toHaveBeenCalledWith({
      include: ["file_search_call.results"],
      input: "Consulta inicial",
      max_output_tokens: 800,
      model: "gpt-5-nano",
      store: false,
      tools: [
        {
          type: "file_search",
          vector_store_ids: ["vs_active_123"],
        },
      ],
    });
    expect(
      deps.spies.persistAssistantMessageWithCitations,
    ).toHaveBeenCalledWith({
      citations: [],
      content: "Respuesta inicial",
      conversationId: "conversation-1",
      providerMessageId: "resp_123",
      userId: "user-1",
    });
    expect(
      deps.spies.persistConversationTurnWithCitations,
    ).not.toHaveBeenCalled();
    expect(result).toEqual({
      citations: [],
      conversationId: "conversation-1",
      grounded: false,
      messageId: "resp_123",
      text: "Respuesta inicial",
    });
  });

  it("loads an existing conversation and includes its history in the model input", async () => {
    const deps = createDeps();
    deps.spies.findConversationHistoryForUserById.mockResolvedValueOnce({
      createdAt: "2026-03-31T12:00:00.000Z",
      id: "conversation-1",
      lastMessageAt: "2026-03-31T12:05:00.000Z",
      messages: [
        {
          content: "Mensaje previo del usuario",
          createdAt: "2026-03-31T12:00:00.000Z",
          id: "message-1",
          role: "user",
        },
        {
          content: "Respuesta previa del asistente",
          createdAt: "2026-03-31T12:01:00.000Z",
          id: "message-2",
          role: "assistant",
        },
      ],
      status: "active",
      title: "Consulta previa",
      updatedAt: "2026-03-31T12:05:00.000Z",
    });
    deps.spies.retrieveVectorStore.mockResolvedValueOnce(
      createReadyVectorStore(),
    );
    deps.spies.createResponse.mockResolvedValueOnce({
      id: "resp_456",
      output: [],
      output_text: "Seguimos con la consulta",
    });
    const createChatResponse = createCreateChatResponse({
      activeVectorStoreId: "vs_active_123",
      catalogStore: deps.catalogStore,
      conversationStore: deps.conversationStore,
      maxHistoryTurns: 12,
      maxOutputTokens: 800,
      model: "gpt-5-nano",
      openAI: deps.openAI,
    });

    const result = await createChatResponse({
      conversationId: "conversation-1",
      message: "Nueva pregunta",
      userId: "user-1",
    });

    expect(deps.spies.findConversationHistoryForUserById).toHaveBeenCalledWith(
      "user-1",
      "conversation-1",
    );
    expect(
      deps.spies.createConversationWithFirstUserMessage,
    ).not.toHaveBeenCalled();
    expect(deps.spies.createResponse).toHaveBeenCalledWith({
      include: ["file_search_call.results"],
      input: [
        "Conversation history:",
        "USER: Mensaje previo del usuario",
        "ASSISTANT: Respuesta previa del asistente",
        "",
        "USER: Nueva pregunta",
      ].join("\n"),
      max_output_tokens: 800,
      model: "gpt-5-nano",
      store: false,
      tools: [
        {
          type: "file_search",
          vector_store_ids: ["vs_active_123"],
        },
      ],
    });
    expect(
      deps.spies.persistConversationTurnWithCitations,
    ).toHaveBeenCalledWith({
      assistantContent: "Seguimos con la consulta",
      assistantProviderMessageId: "resp_456",
      citations: [],
      conversationId: "conversation-1",
      userContent: "Nueva pregunta",
      userId: "user-1",
    });
    expect(
      deps.spies.persistAssistantMessageWithCitations,
    ).not.toHaveBeenCalled();
    expect(result).toEqual({
      citations: [],
      conversationId: "conversation-1",
      grounded: false,
      messageId: "resp_456",
      text: "Seguimos con la consulta",
    });
  });

  it("rejects missing or foreign conversations without exposing ownership details", async () => {
    const deps = createDeps();
    deps.spies.findConversationHistoryForUserById.mockResolvedValueOnce(null);
    const createChatResponse = createCreateChatResponse({
      activeVectorStoreId: "vs_active_123",
      catalogStore: deps.catalogStore,
      conversationStore: deps.conversationStore,
      maxHistoryTurns: 12,
      maxOutputTokens: 800,
      model: "gpt-5-nano",
      openAI: deps.openAI,
    });

    await expect(
      createChatResponse({
        conversationId: "conversation-1",
        message: "Nueva pregunta",
        userId: "user-1",
      }),
    ).rejects.toMatchObject({
      code: "conversation_not_found",
    });
    expect(deps.spies.createResponse).not.toHaveBeenCalled();
  });

  it("fails with a generic upstream error when assistant persistence breaks after the provider succeeds", async () => {
    const deps = createDeps();
    deps.spies.createConversationWithFirstUserMessage.mockResolvedValueOnce({
      conversationId: "conversation-1",
      createdAt: "2026-03-31T12:00:00.000Z",
      lastMessageAt: "2026-03-31T12:00:00.000Z",
      messageId: "message-1",
      status: "active",
      title: "Nueva consulta",
      updatedAt: "2026-03-31T12:00:00.000Z",
    });
    deps.spies.retrieveVectorStore.mockResolvedValueOnce(
      createReadyVectorStore(),
    );
    deps.spies.createResponse.mockResolvedValueOnce({
      id: "resp_123",
      output: [],
      output_text: "Respuesta inicial",
    });
    deps.spies.persistAssistantMessageWithCitations.mockRejectedValueOnce(
      new Error("db write failed"),
    );
    const createChatResponse = createCreateChatResponse({
      activeVectorStoreId: "vs_active_123",
      catalogStore: deps.catalogStore,
      conversationStore: deps.conversationStore,
      maxHistoryTurns: 12,
      maxOutputTokens: 800,
      model: "gpt-5-nano",
      openAI: deps.openAI,
    });

    await expect(
      createChatResponse({
        message: "Consulta inicial",
        userId: "user-1",
      }),
    ).rejects.toMatchObject({
      code: "upstream_request_failed",
      message: "db write failed",
    });
  });

  it("builds grounded citations from assistant annotations and file search results", async () => {
    const deps = createDeps();
    deps.spies.createConversationWithFirstUserMessage.mockResolvedValueOnce({
      conversationId: "conversation-1",
      createdAt: "2026-03-31T12:00:00.000Z",
      lastMessageAt: "2026-03-31T12:00:00.000Z",
      messageId: "message-1",
      status: "active",
      title: "Nueva consulta",
      updatedAt: "2026-03-31T12:00:00.000Z",
    });
    deps.spies.retrieveVectorStore.mockResolvedValueOnce(
      createReadyVectorStore(),
    );
    deps.spies.createResponse.mockResolvedValueOnce({
      id: "resp_grounded",
      output: [
        {
          id: "fs_1",
          queries: ["botanica"],
          results: [
            {
              attributes: {
                doc_id: "botanica-mvp-v1-corpus-mvp",
                title: "Corpus MVP botánico · botanica-mvp-v1",
              },
              file_id: "file-ASiQHbsz76KbGc6o7WMfE3",
              score: 0.98,
              text: "Botánica es la rama de la biología que estudia las plantas.",
            },
            {
              attributes: {
                doc_id: "cuidados-suculentas",
                title: "Guía de suculentas",
              },
              file_id: "file-succulent-guide",
              score: 0.91,
              text: "Las suculentas almacenan agua en hojas, tallos o raíces.",
            },
          ],
          status: "completed",
          type: "file_search_call",
        },
        {
          content: [
            {
              annotations: [
                {
                  file_id: "file-ASiQHbsz76KbGc6o7WMfE3",
                  filename: "botanica-mvp-v1-corpus-mvp.pdf",
                  index: 0,
                  type: "file_citation",
                },
                {
                  file_id: "file-succulent-guide",
                  filename: "suculentas.pdf",
                  index: 1,
                  type: "container_file_citation",
                  container_id: "container_1",
                  end_index: 51,
                  start_index: 24,
                },
                {
                  file_id: "file-ASiQHbsz76KbGc6o7WMfE3",
                  filename: "botanica-mvp-v1-corpus-mvp.pdf",
                  index: 0,
                  type: "file_citation",
                },
              ],
              text: "Según el corpus, la botánica estudia las plantas y las suculentas almacenan agua.",
              type: "output_text",
            },
          ],
          id: "message_1",
          role: "assistant",
          status: "completed",
          type: "message",
        },
      ],
      output_text:
        "Según el corpus, la botánica estudia las plantas y las suculentas almacenan agua.",
    });
    const createChatResponse = createCreateChatResponse({
      activeVectorStoreId: "vs_active_123",
      catalogStore: deps.catalogStore,
      conversationStore: deps.conversationStore,
      maxHistoryTurns: 12,
      maxOutputTokens: 800,
      model: "gpt-5-nano",
      openAI: deps.openAI,
    });

    const result = await createChatResponse({
      message: "Consulta grounded",
      userId: "user-1",
    });

    expect(
      deps.spies.persistAssistantMessageWithCitations,
    ).toHaveBeenCalledWith({
      citations: [
        {
          documentId: "botanica-mvp-v1-corpus-mvp",
          documentName: "Corpus MVP botánico · botanica-mvp-v1",
          fileId: "file-ASiQHbsz76KbGc6o7WMfE3",
          snippet:
            "Botánica es la rama de la biología que estudia las plantas.",
          vectorStoreId: "vs_active_123",
        },
        {
          documentId: "cuidados-suculentas",
          documentName: "Guía de suculentas",
          fileId: "file-succulent-guide",
          snippet: "Las suculentas almacenan agua en hojas, tallos o raíces.",
          vectorStoreId: "vs_active_123",
        },
      ],
      content:
        "Según el corpus, la botánica estudia las plantas y las suculentas almacenan agua.",
      conversationId: "conversation-1",
      providerMessageId: "resp_grounded",
      userId: "user-1",
    });
    expect(result).toEqual({
      citations: [
        {
          documentId: "botanica-mvp-v1-corpus-mvp",
          documentName: "Corpus MVP botánico · botanica-mvp-v1",
          fileId: "file-ASiQHbsz76KbGc6o7WMfE3",
          snippet:
            "Botánica es la rama de la biología que estudia las plantas.",
          vectorStoreId: "vs_active_123",
        },
        {
          documentId: "cuidados-suculentas",
          documentName: "Guía de suculentas",
          fileId: "file-succulent-guide",
          snippet: "Las suculentas almacenan agua en hojas, tallos o raíces.",
          vectorStoreId: "vs_active_123",
        },
      ],
      conversationId: "conversation-1",
      grounded: true,
      messageId: "resp_grounded",
      text: "Según el corpus, la botánica estudia las plantas y las suculentas almacenan agua.",
    });
  });

  it("falls back to the catalog when historical file search results do not expose a title", async () => {
    const deps = createDeps();
    deps.spies.createConversationWithFirstUserMessage.mockResolvedValueOnce({
      conversationId: "conversation-1",
      createdAt: "2026-03-31T12:00:00.000Z",
      lastMessageAt: "2026-03-31T12:00:00.000Z",
      messageId: "message-1",
      status: "active",
      title: "Nueva consulta",
      updatedAt: "2026-03-31T12:00:00.000Z",
    });
    deps.spies.findDocumentByIdentity.mockResolvedValueOnce({
      canonicalPath:
        "datasets/mvp-2026-03/botanica-mvp-v1-corpus-mvp/v1/file.pdf",
      createdAt: "2026-03-31T12:00:00.000Z",
      customMetadata: {},
      datasetVersion: "mvp-2026-03",
      docId: "botanica-mvp-v1-corpus-mvp",
      documentVersion: 1,
      id: "catalog-1",
      lastError: null,
      lastIndexedAt: "2026-03-31T12:00:00.000Z",
      mimeType: "application/pdf",
      openAIFileId: "file-ASiQHbsz76KbGc6o7WMfE3",
      originalFilename: "botanica-mvp-v1-corpus-mvp.pdf",
      sha256: "abc123",
      status: "ready",
      title: "Corpus MVP botánico · botanica-mvp-v1",
      updatedAt: "2026-03-31T12:00:00.000Z",
      vectorStoreId: "vs_active_123",
    });
    deps.spies.retrieveVectorStore.mockResolvedValueOnce(
      createReadyVectorStore(),
    );
    deps.spies.createResponse.mockResolvedValueOnce({
      id: "resp_catalog_fallback",
      output: [
        {
          id: "fs_1",
          queries: ["botanica"],
          results: [
            {
              attributes: {
                dataset_version: "mvp-2026-03",
                doc_id: "botanica-mvp-v1-corpus-mvp",
                document_version: 1,
              },
              file_id: "file-ASiQHbsz76KbGc6o7WMfE3",
              text: "Snippet recuperado del resultado histórico.",
            },
          ],
          status: "completed",
          type: "file_search_call",
        },
        {
          content: [
            {
              annotations: [
                {
                  file_id: "file-ASiQHbsz76KbGc6o7WMfE3",
                  filename: "botanica-mvp-v1-corpus-mvp.pdf",
                  index: 0,
                  type: "file_citation",
                },
              ],
              text: "Respuesta grounded con fallback de catálogo.",
              type: "output_text",
            },
          ],
          id: "message_1",
          role: "assistant",
          status: "completed",
          type: "message",
        },
      ],
      output_text: "Respuesta grounded con fallback de catálogo.",
    });
    const createChatResponse = createCreateChatResponse({
      activeVectorStoreId: "vs_active_123",
      catalogStore: deps.catalogStore,
      conversationStore: deps.conversationStore,
      maxHistoryTurns: 12,
      maxOutputTokens: 800,
      model: "gpt-5-nano",
      openAI: deps.openAI,
    });

    const result = await createChatResponse({
      message: "Consulta grounded",
      userId: "user-1",
    });

    expect(deps.spies.findDocumentByIdentity).toHaveBeenCalledWith({
      datasetVersion: "mvp-2026-03",
      docId: "botanica-mvp-v1-corpus-mvp",
      documentVersion: 1,
    });
    expect(result.citations).toEqual([
      {
        documentId: "botanica-mvp-v1-corpus-mvp",
        documentName: "Corpus MVP botánico · botanica-mvp-v1",
        fileId: "file-ASiQHbsz76KbGc6o7WMfE3",
        snippet: "Snippet recuperado del resultado histórico.",
        vectorStoreId: "vs_active_123",
      },
    ]);
    expect(result.grounded).toBe(true);
  });

  it("uses the first valid file search hit as the canonical snippet for a cited file", async () => {
    const deps = createDeps();
    deps.spies.createConversationWithFirstUserMessage.mockResolvedValueOnce({
      conversationId: "conversation-1",
      createdAt: "2026-03-31T12:00:00.000Z",
      lastMessageAt: "2026-03-31T12:00:00.000Z",
      messageId: "message-1",
      status: "active",
      title: "Nueva consulta",
      updatedAt: "2026-03-31T12:00:00.000Z",
    });
    deps.spies.retrieveVectorStore.mockResolvedValueOnce(
      createReadyVectorStore(),
    );
    deps.spies.createResponse.mockResolvedValueOnce({
      id: "resp_deduped",
      output: [
        {
          id: "fs_1",
          queries: ["botanica"],
          results: [
            {
              attributes: {
                doc_id: "botanica-mvp-v1-corpus-mvp",
                title: "Corpus MVP botánico · botanica-mvp-v1",
              },
              file_id: "file-ASiQHbsz76KbGc6o7WMfE3",
              text: "Primer snippet canónico.",
            },
            {
              attributes: {
                doc_id: "botanica-mvp-v1-corpus-mvp",
                title: "Corpus MVP botánico · botanica-mvp-v1",
              },
              file_id: "file-ASiQHbsz76KbGc6o7WMfE3",
              text: "Segundo snippet menos estable.",
            },
          ],
          status: "completed",
          type: "file_search_call",
        },
        {
          content: [
            {
              annotations: [
                {
                  file_id: "file-ASiQHbsz76KbGc6o7WMfE3",
                  filename: "botanica-mvp-v1-corpus-mvp.pdf",
                  index: 0,
                  type: "file_citation",
                },
              ],
              text: "Respuesta grounded.",
              type: "output_text",
            },
          ],
          id: "message_1",
          role: "assistant",
          status: "completed",
          type: "message",
        },
      ],
      output_text: "Respuesta grounded.",
    });
    const createChatResponse = createCreateChatResponse({
      activeVectorStoreId: "vs_active_123",
      catalogStore: deps.catalogStore,
      conversationStore: deps.conversationStore,
      maxHistoryTurns: 12,
      maxOutputTokens: 800,
      model: "gpt-5-nano",
      openAI: deps.openAI,
    });

    const result = await createChatResponse({
      message: "Consulta grounded",
      userId: "user-1",
    });

    expect(result.citations).toEqual([
      {
        documentId: "botanica-mvp-v1-corpus-mvp",
        documentName: "Corpus MVP botánico · botanica-mvp-v1",
        fileId: "file-ASiQHbsz76KbGc6o7WMfE3",
        snippet: "Primer snippet canónico.",
        vectorStoreId: "vs_active_123",
      },
    ]);
    expect(result.grounded).toBe(true);
  });

  it("ignores annotations without usable file search metadata and stays ungrounded", async () => {
    const deps = createDeps();
    deps.spies.createConversationWithFirstUserMessage.mockResolvedValueOnce({
      conversationId: "conversation-1",
      createdAt: "2026-03-31T12:00:00.000Z",
      lastMessageAt: "2026-03-31T12:00:00.000Z",
      messageId: "message-1",
      status: "active",
      title: "Nueva consulta",
      updatedAt: "2026-03-31T12:00:00.000Z",
    });
    deps.spies.retrieveVectorStore.mockResolvedValueOnce(
      createReadyVectorStore(),
    );
    deps.spies.createResponse.mockResolvedValueOnce({
      id: "resp_missing_metadata",
      output: [
        {
          id: "fs_1",
          queries: ["botanica"],
          results: [
            {
              attributes: {
                title: "Sin doc_id",
              },
              file_id: "file-without-doc-id",
              text: "Snippet incompleto.",
            },
            {
              attributes: {
                doc_id: "sin-snippet",
                title: "Sin snippet",
              },
              file_id: "file-without-snippet",
              text: "",
            },
          ],
          status: "completed",
          type: "file_search_call",
        },
        {
          content: [
            {
              annotations: [
                {
                  file_id: "file-without-doc-id",
                  filename: "sin-docid.pdf",
                  index: 0,
                  type: "file_citation",
                },
                {
                  file_id: "file-without-snippet",
                  filename: "sin-snippet.pdf",
                  index: 1,
                  type: "file_citation",
                },
              ],
              text: "Respuesta sin grounding usable.",
              type: "output_text",
            },
          ],
          id: "message_1",
          role: "assistant",
          status: "completed",
          type: "message",
        },
      ],
      output_text: "Respuesta sin grounding usable.",
    });
    const createChatResponse = createCreateChatResponse({
      activeVectorStoreId: "vs_active_123",
      catalogStore: deps.catalogStore,
      conversationStore: deps.conversationStore,
      maxHistoryTurns: 12,
      maxOutputTokens: 800,
      model: "gpt-5-nano",
      openAI: deps.openAI,
    });

    const result = await createChatResponse({
      message: "Consulta grounded",
      userId: "user-1",
    });

    expect(result.citations).toEqual([]);
    expect(result.grounded).toBe(false);
  });

  it("keeps non-rate-limit upstream failures behind the generic upstream error code", async () => {
    const deps = createDeps();
    deps.spies.createConversationWithFirstUserMessage.mockResolvedValueOnce({
      conversationId: "conversation-1",
      createdAt: "2026-03-31T12:00:00.000Z",
      lastMessageAt: "2026-03-31T12:00:00.000Z",
      messageId: "message-1",
      status: "active",
      title: "Nueva consulta",
      updatedAt: "2026-03-31T12:00:00.000Z",
    });
    deps.spies.retrieveVectorStore.mockResolvedValueOnce(
      createReadyVectorStore(),
    );
    deps.spies.createResponse.mockRejectedValueOnce(
      new OpenAIAdapterError({
        cause: new Error("provider failed"),
        code: "internal_error",
        message: "Provider failed.",
        requestId: "req_123",
        retryable: true,
        status: 500,
        type: "server_error",
      }),
    );
    const createChatResponse = createCreateChatResponse({
      activeVectorStoreId: "vs_active_123",
      catalogStore: deps.catalogStore,
      conversationStore: deps.conversationStore,
      maxHistoryTurns: 12,
      maxOutputTokens: 800,
      model: "gpt-5-nano",
      openAI: deps.openAI,
    });

    await expect(
      createChatResponse({
        message: "Consulta inicial",
        userId: "user-1",
      }),
    ).rejects.toMatchObject({
      code: "upstream_request_failed",
      message: "Provider failed. | request_id=req_123 | code=internal_error",
    });
  });

  it("classifies OpenAI rate limits so the route can expose a 429", async () => {
    const deps = createDeps();
    deps.spies.createConversationWithFirstUserMessage.mockResolvedValueOnce({
      conversationId: "conversation-1",
      createdAt: "2026-03-31T12:00:00.000Z",
      lastMessageAt: "2026-03-31T12:00:00.000Z",
      messageId: "message-1",
      status: "active",
      title: "Nueva consulta",
      updatedAt: "2026-03-31T12:00:00.000Z",
    });
    deps.spies.retrieveVectorStore.mockResolvedValueOnce(
      createReadyVectorStore(),
    );
    deps.spies.createResponse.mockRejectedValueOnce(
      new OpenAIAdapterError({
        cause: new Error("provider failed"),
        code: "rate_limit_exceeded",
        message: "Rate limit exceeded.",
        requestId: "req_123",
        retryable: true,
        status: 429,
        type: "rate_limit_error",
      }),
    );
    const createChatResponse = createCreateChatResponse({
      activeVectorStoreId: "vs_active_123",
      catalogStore: deps.catalogStore,
      conversationStore: deps.conversationStore,
      maxHistoryTurns: 12,
      maxOutputTokens: 800,
      model: "gpt-5-nano",
      openAI: deps.openAI,
    });

    await expect(
      createChatResponse({
        message: "Consulta inicial",
        userId: "user-1",
      }),
    ).rejects.toMatchObject({
      code: "rate_limited",
      message:
        "Rate limit exceeded. | request_id=req_123 | code=rate_limit_exceeded",
    });
  });

  it("keeps OpenAI rate limits from vector store preflight mapped to 429", async () => {
    const deps = createDeps();
    deps.spies.createConversationWithFirstUserMessage.mockResolvedValueOnce({
      conversationId: "conversation-1",
      createdAt: "2026-03-31T12:00:00.000Z",
      lastMessageAt: "2026-03-31T12:00:00.000Z",
      messageId: "message-1",
      status: "active",
      title: "Nueva consulta",
      updatedAt: "2026-03-31T12:00:00.000Z",
    });
    deps.spies.retrieveVectorStore.mockRejectedValueOnce(
      new OpenAIAdapterError({
        cause: new Error("provider failed"),
        code: "rate_limit_exceeded",
        message: "Rate limit exceeded.",
        requestId: "req_456",
        retryable: true,
        status: 429,
        type: "rate_limit_error",
      }),
    );
    const createChatResponse = createCreateChatResponse({
      activeVectorStoreId: "vs_active_123",
      catalogStore: deps.catalogStore,
      conversationStore: deps.conversationStore,
      maxHistoryTurns: 12,
      maxOutputTokens: 800,
      model: "gpt-5-nano",
      openAI: deps.openAI,
    });

    await expect(
      createChatResponse({
        message: "Consulta inicial",
        userId: "user-1",
      }),
    ).rejects.toMatchObject({
      code: "rate_limited",
      message:
        "Active vector store vs_active_123 could not be loaded for chat retrieval: Rate limit exceeded. | request_id=req_456 | code=rate_limit_exceeded",
    });
    expect(deps.spies.createResponse).not.toHaveBeenCalled();
  });

  it("classifies OpenAI timeouts so the route can expose a 504", async () => {
    const deps = createDeps();
    deps.spies.createConversationWithFirstUserMessage.mockResolvedValueOnce({
      conversationId: "conversation-1",
      createdAt: "2026-03-31T12:00:00.000Z",
      lastMessageAt: "2026-03-31T12:00:00.000Z",
      messageId: "message-1",
      status: "active",
      title: "Nueva consulta",
      updatedAt: "2026-03-31T12:00:00.000Z",
    });
    deps.spies.retrieveVectorStore.mockResolvedValueOnce(
      createReadyVectorStore(),
    );
    deps.spies.createResponse.mockRejectedValueOnce(
      new OpenAIAdapterError({
        cause: Object.assign(new Error("Request timed out."), {
          name: "APIConnectionTimeoutError",
        }),
        message: "Request timed out.",
        retryable: true,
      }),
    );
    const createChatResponse = createCreateChatResponse({
      activeVectorStoreId: "vs_active_123",
      catalogStore: deps.catalogStore,
      conversationStore: deps.conversationStore,
      maxHistoryTurns: 12,
      maxOutputTokens: 800,
      model: "gpt-5-nano",
      openAI: deps.openAI,
    });

    await expect(
      createChatResponse({
        message: "Consulta inicial",
        userId: "user-1",
      }),
    ).rejects.toMatchObject({
      code: "upstream_timeout",
      message: "Request timed out.",
    });
  });

  it("keeps OpenAI timeouts from vector store preflight mapped to 504", async () => {
    const deps = createDeps();
    deps.spies.createConversationWithFirstUserMessage.mockResolvedValueOnce({
      conversationId: "conversation-1",
      createdAt: "2026-03-31T12:00:00.000Z",
      lastMessageAt: "2026-03-31T12:00:00.000Z",
      messageId: "message-1",
      status: "active",
      title: "Nueva consulta",
      updatedAt: "2026-03-31T12:00:00.000Z",
    });
    deps.spies.retrieveVectorStore.mockRejectedValueOnce(
      new OpenAIAdapterError({
        cause: Object.assign(new Error("Request timed out."), {
          name: "APIConnectionTimeoutError",
        }),
        message: "Request timed out.",
        retryable: true,
      }),
    );
    const createChatResponse = createCreateChatResponse({
      activeVectorStoreId: "vs_active_123",
      catalogStore: deps.catalogStore,
      conversationStore: deps.conversationStore,
      maxHistoryTurns: 12,
      maxOutputTokens: 800,
      model: "gpt-5-nano",
      openAI: deps.openAI,
    });

    await expect(
      createChatResponse({
        message: "Consulta inicial",
        userId: "user-1",
      }),
    ).rejects.toMatchObject({
      code: "upstream_timeout",
      message:
        "Active vector store vs_active_123 could not be loaded for chat retrieval: Request timed out.",
    });
    expect(deps.spies.createResponse).not.toHaveBeenCalled();
  });

  it("fails before inference when the active vector store is not ready", async () => {
    const deps = createDeps();
    deps.spies.createConversationWithFirstUserMessage.mockResolvedValueOnce({
      conversationId: "conversation-1",
      createdAt: "2026-03-31T12:00:00.000Z",
      lastMessageAt: "2026-03-31T12:00:00.000Z",
      messageId: "message-1",
      status: "active",
      title: "Nueva consulta",
      updatedAt: "2026-03-31T12:00:00.000Z",
    });
    deps.spies.retrieveVectorStore.mockResolvedValueOnce({
      file_counts: {
        cancelled: 0,
        completed: 1,
        failed: 0,
        in_progress: 0,
        total: 1,
      },
      id: "vs_active_123",
      status: "in_progress",
    });
    const createChatResponse = createCreateChatResponse({
      activeVectorStoreId: "vs_active_123",
      catalogStore: deps.catalogStore,
      conversationStore: deps.conversationStore,
      maxHistoryTurns: 12,
      maxOutputTokens: 800,
      model: "gpt-5-nano",
      openAI: deps.openAI,
    });

    await expect(
      createChatResponse({
        message: "Consulta inicial",
        userId: "user-1",
      }),
    ).rejects.toMatchObject({
      code: "upstream_request_failed",
      message:
        "Active vector store vs_active_123 is not ready for chat retrieval: status=in_progress.",
    });
    expect(deps.spies.createResponse).not.toHaveBeenCalled();
  });

  it("fails before inference when the active vector store has no completed files", async () => {
    const deps = createDeps();
    deps.spies.createConversationWithFirstUserMessage.mockResolvedValueOnce({
      conversationId: "conversation-1",
      createdAt: "2026-03-31T12:00:00.000Z",
      lastMessageAt: "2026-03-31T12:00:00.000Z",
      messageId: "message-1",
      status: "active",
      title: "Nueva consulta",
      updatedAt: "2026-03-31T12:00:00.000Z",
    });
    deps.spies.retrieveVectorStore.mockResolvedValueOnce({
      file_counts: {
        cancelled: 0,
        completed: 0,
        failed: 1,
        in_progress: 0,
        total: 1,
      },
      id: "vs_active_123",
      status: "completed",
    });
    const createChatResponse = createCreateChatResponse({
      activeVectorStoreId: "vs_active_123",
      catalogStore: deps.catalogStore,
      conversationStore: deps.conversationStore,
      maxHistoryTurns: 12,
      maxOutputTokens: 800,
      model: "gpt-5-nano",
      openAI: deps.openAI,
    });

    await expect(
      createChatResponse({
        message: "Consulta inicial",
        userId: "user-1",
      }),
    ).rejects.toMatchObject({
      code: "upstream_request_failed",
      message:
        "Active vector store vs_active_123 does not contain any completed files for chat retrieval.",
    });
    expect(deps.spies.createResponse).not.toHaveBeenCalled();
  });

  it("truncates persisted history to the most recent configured turns in chronological order", async () => {
    const deps = createDeps();
    deps.spies.findConversationHistoryForUserById.mockResolvedValueOnce({
      createdAt: "2026-03-31T12:00:00.000Z",
      id: "conversation-1",
      lastMessageAt: "2026-03-31T12:05:00.000Z",
      messages: [
        {
          content: "Mensaje 1",
          createdAt: "2026-03-31T12:00:00.000Z",
          id: "message-1",
          role: "user",
        },
        {
          content: "Mensaje 2",
          createdAt: "2026-03-31T12:01:00.000Z",
          id: "message-2",
          role: "assistant",
        },
        {
          content: "Mensaje 3",
          createdAt: "2026-03-31T12:02:00.000Z",
          id: "message-3",
          role: "user",
        },
        {
          content: "Mensaje 4",
          createdAt: "2026-03-31T12:03:00.000Z",
          id: "message-4",
          role: "assistant",
        },
      ],
      status: "active",
      title: "Consulta previa",
      updatedAt: "2026-03-31T12:05:00.000Z",
    });
    deps.spies.retrieveVectorStore.mockResolvedValueOnce(
      createReadyVectorStore(),
    );
    deps.spies.createResponse.mockResolvedValueOnce({
      id: "resp_789",
      output: [],
      output_text: "Respuesta truncada",
    });
    const createChatResponse = createCreateChatResponse({
      activeVectorStoreId: "vs_active_123",
      catalogStore: deps.catalogStore,
      conversationStore: deps.conversationStore,
      maxHistoryTurns: 2,
      maxOutputTokens: 321,
      model: "gpt-5-nano",
      openAI: deps.openAI,
    });

    const result = await createChatResponse({
      conversationId: "conversation-1",
      message: "Nueva pregunta",
      userId: "user-1",
    });

    expect(deps.spies.createResponse).toHaveBeenCalledWith({
      include: ["file_search_call.results"],
      input: [
        "Conversation history:",
        "USER: Mensaje 3",
        "ASSISTANT: Mensaje 4",
        "",
        "USER: Nueva pregunta",
      ].join("\n"),
      max_output_tokens: 321,
      model: "gpt-5-nano",
      store: false,
      tools: [
        {
          type: "file_search",
          vector_store_ids: ["vs_active_123"],
        },
      ],
    });
    expect(
      deps.spies.persistConversationTurnWithCitations,
    ).toHaveBeenCalledWith({
      assistantContent: "Respuesta truncada",
      assistantProviderMessageId: "resp_789",
      citations: [],
      conversationId: "conversation-1",
      userContent: "Nueva pregunta",
      userId: "user-1",
    });
    expect(result).toEqual({
      citations: [],
      conversationId: "conversation-1",
      grounded: false,
      messageId: "resp_789",
      text: "Respuesta truncada",
    });
  });
});
