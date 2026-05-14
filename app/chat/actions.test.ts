import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_CHAT_MAX_MESSAGE_CHARS } from "@/lib/chat/env";
import { initialCreateConversationFormState } from "./create-conversation-form-state";

const getOptionalAppSessionMock = vi.fn();
const createConversationWithFirstUserMessageMock = vi.fn();
const revalidatePathMock = vi.fn();
const resolveActiveDatasetMock = vi.fn();
const redirectMock = vi.fn((path: string) => {
  throw new Error(`REDIRECT:${path}`);
});

vi.mock("next/cache", () => ({
  revalidatePath: revalidatePathMock,
}));

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));

vi.mock("@/lib/auth/app-session", () => ({
  getOptionalAppSession: getOptionalAppSessionMock,
}));

vi.mock("@/lib/supabase/conversation-store", () => ({
  conversationStore: {
    createConversationWithFirstUserMessage:
      createConversationWithFirstUserMessageMock,
  },
}));

vi.mock("@/lib/knowledge/active-dataset", () => ({
  activeKnowledgeDatasetResolver: {
    resolveActiveDataset: resolveActiveDatasetMock,
  },
}));

function buildFormData(message: string) {
  const formData = new FormData();
  formData.set("message", message);

  return formData;
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  resolveActiveDatasetMock.mockResolvedValue({
    datasetVersion: "mvp-2026-03",
    source: "active_registry",
    vectorStoreId: "vs_active_123",
  });
});

describe("createConversationAction", () => {
  it("redirects unauthenticated requests back to Auth.js", async () => {
    getOptionalAppSessionMock.mockResolvedValueOnce(null);
    const { createConversationAction } = await import("./actions");

    await expect(
      createConversationAction(
        initialCreateConversationFormState,
        buildFormData("Consulta de prueba"),
      ),
    ).rejects.toThrow("REDIRECT:/sign-in?callbackUrl=%2Fchat");

    expect(createConversationWithFirstUserMessageMock).not.toHaveBeenCalled();
  });

  it("returns a validation error when the message is empty after trimming", async () => {
    getOptionalAppSessionMock.mockResolvedValueOnce({
      persistedIdentity: {
        user: {
          id: "user-1",
        },
      },
      session: {
        user: {
          id: "google:sub_123",
        },
      },
    });
    const { createConversationAction } = await import("./actions");

    const result = await createConversationAction(
      initialCreateConversationFormState,
      buildFormData("   "),
    );

    expect(result).toEqual({
      error: "Escribe un mensaje para iniciar la conversacion.",
      message: "   ",
    });
    expect(createConversationWithFirstUserMessageMock).not.toHaveBeenCalled();
  });

  it("returns a validation error when the message exceeds the runtime limit", async () => {
    getOptionalAppSessionMock.mockResolvedValueOnce({
      persistedIdentity: {
        user: {
          id: "user-1",
        },
      },
      session: {
        user: {
          id: "google:sub_123",
        },
      },
    });
    const { createConversationAction } = await import("./actions");

    const result = await createConversationAction(
      initialCreateConversationFormState,
      buildFormData("x".repeat(DEFAULT_CHAT_MAX_MESSAGE_CHARS + 1)),
    );

    expect(result).toEqual({
      error: `El mensaje no puede superar ${DEFAULT_CHAT_MAX_MESSAGE_CHARS} caracteres.`,
      message: "x".repeat(DEFAULT_CHAT_MAX_MESSAGE_CHARS + 1),
    });
    expect(createConversationWithFirstUserMessageMock).not.toHaveBeenCalled();
  });

  it("creates the conversation, revalidates /chat, and redirects on success", async () => {
    getOptionalAppSessionMock.mockResolvedValueOnce({
      persistedIdentity: {
        user: {
          id: "user-1",
        },
      },
      session: {
        user: {
          id: "google:sub_123",
        },
      },
    });
    createConversationWithFirstUserMessageMock.mockResolvedValueOnce({
      conversationId: "conversation-1",
      messageId: "message-1",
    });
    const { createConversationAction } = await import("./actions");

    await expect(
      createConversationAction(
        initialCreateConversationFormState,
        buildFormData("  Mensaje persistido  "),
      ),
    ).rejects.toThrow("REDIRECT:/chat?conversation=conversation-1");

    expect(createConversationWithFirstUserMessageMock).toHaveBeenCalledWith({
      userId: "user-1",
      content: "Mensaje persistido",
      datasetVersion: "mvp-2026-03",
      vectorStoreId: "vs_active_123",
    });
    expect(revalidatePathMock).toHaveBeenCalledWith("/chat");
  });

  it("returns an error before creating a conversation when no active dataset can be resolved", async () => {
    getOptionalAppSessionMock.mockResolvedValueOnce({
      persistedIdentity: {
        user: {
          id: "user-1",
        },
      },
      session: {
        user: {
          id: "google:sub_123",
        },
      },
    });
    resolveActiveDatasetMock.mockRejectedValueOnce(
      new Error("No active dataset"),
    );
    const { createConversationAction } = await import("./actions");

    const result = await createConversationAction(
      initialCreateConversationFormState,
      buildFormData("Mensaje persistido"),
    );

    expect(result).toEqual({
      error: "No se pudo resolver el dataset documental activo.",
      message: "Mensaje persistido",
    });
    expect(createConversationWithFirstUserMessageMock).not.toHaveBeenCalled();
  });
});
