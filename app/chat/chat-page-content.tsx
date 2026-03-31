"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  BadgeHelp,
  Camera,
  History,
  Leaf,
  LoaderCircle,
  type LucideIcon,
  Menu,
  MessageSquarePlus,
  RotateCcw,
  Settings,
  Sprout,
  Stethoscope,
  X,
} from "lucide-react";
import { SignOutForm } from "@/components/auth/sign-out-form";
import { buildRelativeSignInUrl } from "@/lib/auth/access";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { cn } from "@/lib/utils";
import type { AppRole } from "@/lib/auth/roles";
import type { PersistedConversationHistoryConversation } from "@/lib/supabase/conversation-store";
import { ContinueConversationForm } from "./continue-conversation-form";
import { CreateConversationForm } from "./create-conversation-form";

export type ChatPageUser = {
  id: string;
  email: string | null;
  name: string | null;
  role: AppRole;
};

type ChatCitation = {
  documentId: string;
  documentName: string;
  fileId: string;
  snippet: string;
  vectorStoreId: string;
};

type TransientConversationMessage = {
  citations?: ChatCitation[];
  content: string;
  createdAt: string;
  deliveryStatus: "pending" | "failed" | "ready";
  errorMessage?: string | null;
  grounded?: boolean;
  id: string;
  messageId?: string;
  role: "user" | "assistant" | "system";
};

type DisplayConversationMessage = {
  citations?: ChatCitation[];
  content: string;
  createdAt: string;
  deliveryStatus: "pending" | "failed" | "ready";
  errorMessage?: string | null;
  grounded?: boolean;
  id: string;
  messageId?: string;
  role: "user" | "assistant" | "system";
};

type ConversationUiState = {
  isSubmitting: boolean;
  messages: TransientConversationMessage[];
};

type ChatPageContentProps = {
  composer: {
    maxMessageChars: number;
  };
  history: PersistedConversationHistoryConversation[];
  selectedConversationId: string | null;
  user: ChatPageUser;
};

const DEFAULT_CONVERSATION_UI_STATE: ConversationUiState = {
  isSubmitting: false,
  messages: [],
};

const GENERIC_CHAT_REQUEST_ERROR_MESSAGE =
  "No se pudo enviar el mensaje. Intentalo de nuevo.";
const GENERIC_CHAT_RESPONSE_ERROR_MESSAGE =
  "La respuesta del chat no llego con un formato valido.";
const REAUTHENTICATION_CHAT_MESSAGE =
  "Tu sesion ha caducado. Inicia sesion para continuar.";

const suggestionChips = [
  "Cuidado de suculentas",
  "Poda de rosales",
  "Falta de luz",
  "Plagas comunes",
] as const;

const welcomeFeatures = [
  {
    body: "Sube una foto para identificar especies al instante.",
    icon: Camera,
    title: "Identificacion Visual",
  },
  {
    body: "Describe los sintomas para un diagnostico experto.",
    icon: Stethoscope,
    title: "Doctor de Plantas",
  },
] as const;

const roleLabels: Record<AppRole, string> = {
  admin: "Admin Tier",
  expert: "Expert Tier",
  user: "Starter Tier",
};

function formatTimestamp(timestamp: string | null) {
  if (!timestamp) {
    return "Sin actividad";
  }

  return new Intl.DateTimeFormat("es-ES", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(timestamp));
}

function resolveConversationLabel(
  conversation: PersistedConversationHistoryConversation,
) {
  return conversation.title ?? "Conversacion sin titulo";
}

function createTransientMessageId(prefix: string) {
  if (
    typeof globalThis.crypto !== "undefined" &&
    typeof globalThis.crypto.randomUUID === "function"
  ) {
    return `${prefix}-${globalThis.crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function getConversationUiState(
  conversationUiStateById: Record<string, ConversationUiState | undefined>,
  conversationId: string | null,
) {
  if (!conversationId) {
    return DEFAULT_CONVERSATION_UI_STATE;
  }

  return (
    conversationUiStateById[conversationId] ?? DEFAULT_CONVERSATION_UI_STATE
  );
}

function getDisplayConversationMessages(
  conversation: PersistedConversationHistoryConversation,
  transientMessages: TransientConversationMessage[],
): DisplayConversationMessage[] {
  const persistedMessages = conversation.messages.map((message) => ({
    content: message.content,
    createdAt: message.createdAt,
    deliveryStatus: "ready" as const,
    id: message.id,
    role: message.role,
  }));

  return [...persistedMessages, ...transientMessages];
}

function getFirstChatIssue(payload: unknown) {
  if (
    typeof payload !== "object" ||
    payload === null ||
    !("issues" in payload)
  ) {
    return null;
  }

  const issues = payload.issues;

  if (typeof issues !== "object" || issues === null) {
    return null;
  }

  for (const field of ["message", "conversationId"]) {
    const fieldIssues = (issues as Record<string, unknown>)[field];

    if (!Array.isArray(fieldIssues)) {
      continue;
    }

    const firstIssue = fieldIssues.find(
      (issue): issue is string =>
        typeof issue === "string" && issue.trim().length > 0,
    );

    if (firstIssue) {
      return firstIssue;
    }
  }

  return null;
}

function getChatErrorMessage(status: number, payload: unknown) {
  if (status === 400) {
    const firstIssue = getFirstChatIssue(payload);

    if (firstIssue) {
      return firstIssue;
    }
  }

  if (
    typeof payload === "object" &&
    payload !== null &&
    "message" in payload &&
    typeof payload.message === "string" &&
    payload.message.trim().length > 0
  ) {
    return payload.message;
  }

  return GENERIC_CHAT_REQUEST_ERROR_MESSAGE;
}

function isChatCitationPayload(value: unknown): value is ChatCitation {
  return (
    typeof value === "object" &&
    value !== null &&
    "documentId" in value &&
    typeof value.documentId === "string" &&
    value.documentId.trim().length > 0 &&
    "documentName" in value &&
    typeof value.documentName === "string" &&
    value.documentName.trim().length > 0 &&
    "fileId" in value &&
    typeof value.fileId === "string" &&
    value.fileId.trim().length > 0 &&
    "snippet" in value &&
    typeof value.snippet === "string" &&
    value.snippet.trim().length > 0 &&
    "vectorStoreId" in value &&
    typeof value.vectorStoreId === "string" &&
    value.vectorStoreId.trim().length > 0
  );
}

function isChatResponsePayload(value: unknown): value is {
  citations: ChatCitation[];
  conversationId: string;
  grounded: boolean;
  messageId: string;
  text: string;
} {
  return (
    typeof value === "object" &&
    value !== null &&
    "citations" in value &&
    Array.isArray(value.citations) &&
    value.citations.every(isChatCitationPayload) &&
    "conversationId" in value &&
    typeof value.conversationId === "string" &&
    value.conversationId.trim().length > 0 &&
    "grounded" in value &&
    typeof value.grounded === "boolean" &&
    "messageId" in value &&
    typeof value.messageId === "string" &&
    value.messageId.trim().length > 0 &&
    "text" in value &&
    typeof value.text === "string" &&
    value.text.trim().length > 0
  );
}

function PlaceholderSidebarAction({
  children,
  icon: Icon,
}: {
  children: string;
  icon: LucideIcon;
}) {
  return (
    <button
      aria-disabled="true"
      className="botanical-placeholder inline-flex h-9 w-full items-center gap-3 rounded-lg px-3 text-left text-sm font-medium"
      disabled
      tabIndex={-1}
      type="button"
    >
      <Icon className="size-4" />
      <span>{children}</span>
    </button>
  );
}

function ChatSidebarContent({
  history,
  isMobile,
  selectedConversationId,
  user,
}: {
  history: PersistedConversationHistoryConversation[];
  isMobile?: boolean;
  selectedConversationId: string | null;
  user: ChatPageUser;
}) {
  return (
    <div className="flex h-full flex-col p-6">
      <div className="flex items-center justify-between pb-6">
        <p className="font-semibold leading-7 text-[#274f3d]">Greenhouse Lab</p>
        {isMobile ? (
          <DrawerClose
            aria-label="Cerrar menu"
            className="botanical-focus inline-flex size-10 items-center justify-center rounded-xl text-[#566342] transition hover:bg-white/70"
          >
            <X className="size-5" />
          </DrawerClose>
        ) : null}
      </div>

      <div className="flex flex-1 flex-col gap-4 overflow-y-auto">
        <div className="space-y-1">
          <Link
            aria-current={selectedConversationId ? undefined : "page"}
            className={cn(
              "botanical-focus flex h-9 items-center gap-3 rounded-lg px-3 text-sm font-medium transition",
              selectedConversationId
                ? "text-[#566342] hover:bg-white/65"
                : "bg-[#e4e2db] text-[#274f3d]",
            )}
            href="/chat"
          >
            <MessageSquarePlus className="size-4" />
            <span>New Chat</span>
          </Link>

          <div className="flex h-9 items-center gap-3 px-3 text-sm font-medium text-[#566342]">
            <History className="size-4" />
            <span>Botanical History</span>
          </div>
        </div>

        <div className="space-y-3 px-3">
          <p className="text-[0.625rem] font-semibold uppercase tracking-[0.08em] text-[#707973]">
            Recent inquiries
          </p>
          <div className="space-y-1">
            {history.length === 0 ? (
              <p className="text-sm leading-5 text-[#707973]">
                Aun no hay consultas guardadas.
              </p>
            ) : (
              history.map((conversation) => {
                const isActive = conversation.id === selectedConversationId;

                return (
                  <Link
                    aria-current={isActive ? "page" : undefined}
                    className={cn(
                      "botanical-focus block truncate rounded-lg px-2 py-1 text-sm leading-5 transition",
                      isActive
                        ? "bg-white/80 font-medium text-[#274f3d]"
                        : "text-[#404943] hover:bg-white/65",
                    )}
                    href={`/chat?conversation=${encodeURIComponent(conversation.id)}`}
                    key={conversation.id}
                    title={resolveConversationLabel(conversation)}
                  >
                    {resolveConversationLabel(conversation)}
                  </Link>
                );
              })
            )}
          </div>
        </div>

        <div className="space-y-1 pt-2">
          <PlaceholderSidebarAction icon={Leaf}>
            Saved Plants
          </PlaceholderSidebarAction>
          <PlaceholderSidebarAction icon={Sprout}>
            Care Guides
          </PlaceholderSidebarAction>
        </div>
      </div>

      <div className="mt-6 border-t border-[rgba(191,201,193,0.3)] pt-6">
        <button
          aria-disabled="true"
          className="botanical-focus inline-flex h-11 w-full cursor-default items-center justify-center rounded-xl bg-[#274f3d] px-4 text-sm font-semibold text-white shadow-[0_10px_15px_-3px_rgba(39,79,61,0.1),0_4px_6px_-4px_rgba(39,79,61,0.1)]"
          disabled
          tabIndex={-1}
          type="button"
        >
          Upgrade to Pro
        </button>

        <div className="mt-6 space-y-1">
          <PlaceholderSidebarAction icon={Settings}>
            Settings
          </PlaceholderSidebarAction>
          <PlaceholderSidebarAction icon={BadgeHelp}>
            Help
          </PlaceholderSidebarAction>
          <SignOutForm
            buttonClassName="h-9 w-full justify-start gap-3 rounded-lg border-0 bg-transparent px-3 text-sm font-medium text-[#566342] shadow-none hover:bg-white/65"
            label="Cerrar sesion"
          />
        </div>

        <div className="mt-6 flex items-center gap-3 px-2">
          <div className="flex size-8 items-center justify-center rounded-full bg-[#dae8be]">
            <Leaf className="size-3.5 text-[#566342]" />
          </div>
          <div>
            <p className="text-xs font-semibold text-[#1b1c17]">
              {roleLabels[user.role]}
            </p>
            <p className="text-[0.625rem] leading-5 text-[#707973]">
              {user.name ?? user.email ?? "Perfil activo"}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function ConversationView({
  conversation,
  messages,
  onRetryMessage,
}: {
  conversation: PersistedConversationHistoryConversation;
  messages: DisplayConversationMessage[];
  onRetryMessage(messageId: string): void;
}) {
  return (
    <div className="w-full max-w-[48rem] space-y-6 py-8">
      <header className="botanical-surface rounded-[2rem] p-8">
        <div className="flex flex-wrap items-center gap-3 text-xs uppercase tracking-[0.12em] text-[#707973]">
          <span className="rounded-full border border-[rgba(191,201,193,0.55)] bg-[#f6f4ec] px-3 py-1 font-semibold text-[#566342]">
            {conversation.status}
          </span>
          <span>{messages.length} mensajes</span>
          <span>
            {formatTimestamp(
              messages.at(-1)?.createdAt ??
                conversation.lastMessageAt ??
                conversation.updatedAt,
            )}
          </span>
        </div>
        <h1 className="mt-5 font-display text-[2.125rem] font-extrabold leading-[2.5rem] tracking-[-0.03em] text-[#274f3d]">
          {resolveConversationLabel(conversation)}
        </h1>
      </header>

      <div className="space-y-4">
        {messages.map((message) => {
          const isUser = message.role === "user";
          const isFailed = message.deliveryStatus === "failed";
          const isPending = message.deliveryStatus === "pending";

          return (
            <div
              className={cn("flex", isUser ? "justify-end" : "justify-start")}
              key={message.id}
            >
              <article
                className={cn(
                  "max-w-[42rem] rounded-[1.5rem] px-5 py-4 shadow-[0_10px_15px_-3px_rgba(39,79,61,0.06),0_4px_6px_-4px_rgba(39,79,61,0.06)]",
                  isUser && isFailed
                    ? "border border-[#e2b4b4] bg-[#fff2f2] text-[#7a3838]"
                    : isUser
                      ? "bg-[#274f3d] text-white"
                      : message.role === "assistant"
                        ? "border border-[rgba(191,201,193,0.35)] bg-white text-[#1b1c17]"
                        : "bg-[#f0eee6] text-[#404943]",
                )}
              >
                <div
                  className={cn(
                    "mb-2 flex items-center gap-3 text-[0.6875rem] uppercase tracking-[0.12em]",
                    isUser && !isFailed ? "text-white/75" : "text-[#707973]",
                  )}
                >
                  <span>{message.role}</span>
                  <span>{formatTimestamp(message.createdAt)}</span>
                </div>
                <p className="whitespace-pre-wrap text-sm leading-7">
                  {message.content}
                </p>
                {isPending ? (
                  <p
                    aria-live="polite"
                    className={cn(
                      "mt-3 inline-flex items-center gap-2 text-xs font-medium",
                      isUser ? "text-white/75" : "text-[#566342]",
                    )}
                  >
                    <LoaderCircle className="size-3.5 animate-spin" />
                    <span>Enviando...</span>
                  </p>
                ) : null}
                {isFailed ? (
                  <div
                    aria-live="polite"
                    className="mt-3 space-y-3 rounded-2xl border border-[#f0d2d2] bg-white/80 p-3 text-sm text-[#7a3838]"
                  >
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                      <p className="leading-6">
                        {message.errorMessage ??
                          GENERIC_CHAT_REQUEST_ERROR_MESSAGE}
                      </p>
                    </div>
                    <Button
                      className="h-8 rounded-xl border-[#e2b4b4] bg-white text-[#7a3838] hover:bg-[#fff6f6]"
                      onClick={() => onRetryMessage(message.id)}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      <RotateCcw className="size-3.5" />
                      Reintentar
                    </Button>
                  </div>
                ) : null}
              </article>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function ChatPageContent({
  composer,
  history,
  selectedConversationId,
  user,
}: ChatPageContentProps) {
  const router = useRouter();
  const [draftMessage, setDraftMessage] = useState("");
  const [conversationUiStateById, setConversationUiStateById] = useState<
    Record<string, ConversationUiState | undefined>
  >({});
  const selectedConversation =
    history.find(
      (conversation) => conversation.id === selectedConversationId,
    ) ?? null;
  const hasMissingConversation =
    selectedConversationId !== null && selectedConversation === null;
  const selectedConversationUiState = getConversationUiState(
    conversationUiStateById,
    selectedConversationId,
  );
  const selectedConversationMessages = selectedConversation
    ? getDisplayConversationMessages(
        selectedConversation,
        selectedConversationUiState.messages,
      )
    : [];

  function updateConversationUiState(
    conversationId: string,
    updater: (state: ConversationUiState) => ConversationUiState,
  ) {
    setConversationUiStateById((currentState) => ({
      ...currentState,
      [conversationId]: updater(
        currentState[conversationId] ?? DEFAULT_CONVERSATION_UI_STATE,
      ),
    }));
  }

  async function sendConversationMessageRequest(input: {
    conversationId: string;
    localMessageId: string;
    message: string;
  }) {
    try {
      const response = await fetch("/api/chat", {
        body: JSON.stringify({
          conversationId: input.conversationId,
          message: input.message,
        }),
        headers: {
          "content-type": "application/json",
        },
        method: "POST",
      });

      let payload: unknown = null;

      try {
        payload = await response.json();
      } catch {
        payload = null;
      }

      if (response.status === 401) {
        updateConversationUiState(input.conversationId, (state) => ({
          isSubmitting: false,
          messages: state.messages.map((message) =>
            message.id === input.localMessageId
              ? {
                  ...message,
                  deliveryStatus: "failed" as const,
                  errorMessage: REAUTHENTICATION_CHAT_MESSAGE,
                }
              : message,
          ),
        }));
        router.push(
          buildRelativeSignInUrl(
            `/chat?conversation=${encodeURIComponent(input.conversationId)}`,
          ),
        );
        return;
      }

      if (!response.ok) {
        const errorMessage = getChatErrorMessage(response.status, payload);

        updateConversationUiState(input.conversationId, (state) => ({
          isSubmitting: false,
          messages: state.messages.map((message) =>
            message.id === input.localMessageId
              ? {
                  ...message,
                  deliveryStatus: "failed" as const,
                  errorMessage,
                }
              : message,
          ),
        }));
        return;
      }

      if (!isChatResponsePayload(payload)) {
        updateConversationUiState(input.conversationId, (state) => ({
          isSubmitting: false,
          messages: state.messages.map((message) =>
            message.id === input.localMessageId
              ? {
                  ...message,
                  deliveryStatus: "failed" as const,
                  errorMessage: GENERIC_CHAT_RESPONSE_ERROR_MESSAGE,
                }
              : message,
          ),
        }));
        return;
      }

      updateConversationUiState(input.conversationId, (state) => ({
        isSubmitting: false,
        messages: [
          ...state.messages.map((message) =>
            message.id === input.localMessageId
              ? {
                  ...message,
                  deliveryStatus: "ready" as const,
                  errorMessage: null,
                }
              : message,
          ),
          {
            citations: payload.citations,
            content: payload.text,
            createdAt: new Date().toISOString(),
            deliveryStatus: "ready" as const,
            grounded: payload.grounded,
            id: createTransientMessageId("assistant-message"),
            messageId: payload.messageId,
            role: "assistant",
          },
        ],
      }));
    } catch {
      updateConversationUiState(input.conversationId, (state) => ({
        isSubmitting: false,
        messages: state.messages.map((message) =>
          message.id === input.localMessageId
            ? {
                ...message,
                deliveryStatus: "failed" as const,
                errorMessage: GENERIC_CHAT_REQUEST_ERROR_MESSAGE,
              }
            : message,
        ),
      }));
    }
  }

  function submitSelectedConversationMessage(input: {
    conversationId: string;
    message: string;
  }) {
    if (
      !selectedConversation ||
      selectedConversation.id !== input.conversationId ||
      selectedConversationUiState.isSubmitting
    ) {
      return false;
    }

    const localMessageId = createTransientMessageId("user-message");

    updateConversationUiState(input.conversationId, (state) => ({
      isSubmitting: true,
      messages: [
        ...state.messages,
        {
          content: input.message,
          createdAt: new Date().toISOString(),
          deliveryStatus: "pending" as const,
          errorMessage: null,
          id: localMessageId,
          role: "user",
        },
      ],
    }));

    void sendConversationMessageRequest({
      conversationId: input.conversationId,
      localMessageId,
      message: input.message,
    });

    return true;
  }

  function retrySelectedConversationMessage(localMessageId: string) {
    if (!selectedConversationId || selectedConversationUiState.isSubmitting) {
      return;
    }

    const failedMessage = selectedConversationUiState.messages.find(
      (message) =>
        message.id === localMessageId &&
        message.role === "user" &&
        message.deliveryStatus === "failed",
    );

    if (!failedMessage) {
      return;
    }

    updateConversationUiState(selectedConversationId, (state) => ({
      isSubmitting: true,
      messages: state.messages.map((message) =>
        message.id === localMessageId
          ? {
              ...message,
              deliveryStatus: "pending" as const,
              errorMessage: null,
            }
          : message,
      ),
    }));

    void sendConversationMessageRequest({
      conversationId: selectedConversationId,
      localMessageId,
      message: failedMessage.content,
    });
  }

  return (
    <main className="min-h-screen bg-[#fbf9f1] text-[#1b1c17] lg:h-screen">
      <div className="flex min-h-screen lg:h-screen">
        <aside className="hidden h-screen w-72 shrink-0 border-r border-[rgba(191,201,193,0.2)] bg-[#f0eee6] lg:flex">
          <ChatSidebarContent
            history={history}
            selectedConversationId={selectedConversationId}
            user={user}
          />
        </aside>

        <div className="relative flex min-h-screen flex-1 flex-col overflow-hidden lg:h-screen">
          <div className="absolute inset-0 opacity-30">
            <div className="absolute -right-24 -top-24 size-96 rounded-full bg-[#274f3d] blur-[100px]" />
            <div className="absolute bottom-64 -left-24 size-64 rounded-full bg-[#703800] blur-[80px]" />
          </div>

          <div className="relative flex items-center justify-between border-b border-[rgba(191,201,193,0.25)] bg-white/90 px-4 py-4 backdrop-blur lg:hidden">
            <Drawer>
              <DrawerTrigger
                aria-label="Abrir navegacion del chat"
                className="botanical-focus inline-flex size-11 items-center justify-center rounded-xl border border-[rgba(191,201,193,0.35)] bg-white text-[#274f3d]"
              >
                <Menu className="size-5" />
              </DrawerTrigger>
              <DrawerContent>
                <DrawerTitle className="sr-only">
                  Navegacion del chat
                </DrawerTitle>
                <ChatSidebarContent
                  history={history}
                  isMobile
                  selectedConversationId={selectedConversationId}
                  user={user}
                />
              </DrawerContent>
            </Drawer>

            <p className="font-semibold text-[#274f3d]">Greenhouse Lab</p>

            <Link
              className="botanical-focus inline-flex items-center gap-2 rounded-xl bg-[#274f3d] px-4 py-2.5 text-sm font-semibold text-white"
              href="/chat"
            >
              <MessageSquarePlus className="size-4" />
              Nuevo
            </Link>
          </div>

          <section className="relative flex-1 overflow-y-auto bg-white px-4 py-10 sm:px-6 lg:px-12 lg:py-0">
            <div className="mx-auto flex min-h-full w-full max-w-[56rem] flex-col items-center justify-center py-10 lg:py-16">
              {selectedConversation ? (
                <ConversationView
                  conversation={selectedConversation}
                  messages={selectedConversationMessages}
                  onRetryMessage={retrySelectedConversationMessage}
                />
              ) : hasMissingConversation ? (
                <div className="botanical-surface w-full max-w-[40rem] rounded-[2rem] p-8 text-center">
                  <p className="text-sm font-semibold uppercase tracking-[0.12em] text-[#707973]">
                    Conversacion no encontrada
                  </p>
                  <h1 className="mt-4 font-display text-[2rem] font-extrabold leading-10 tracking-[-0.03em] text-[#274f3d]">
                    Esta consulta ya no esta disponible en tu historial.
                  </h1>
                  <p className="mt-4 text-base leading-7 text-[#566342]">
                    Puedes volver al estado inicial o comenzar una nueva
                    conversacion con el compositor inferior.
                  </p>
                  <Link
                    className="botanical-focus mt-8 inline-flex rounded-xl bg-[#274f3d] px-6 py-3 font-display text-base font-bold text-white"
                    href="/chat"
                  >
                    Volver a nueva consulta
                  </Link>
                </div>
              ) : (
                <>
                  <div className="pb-12 text-center">
                    <div className="mx-auto flex h-[4.09375rem] w-20 items-center justify-center rounded-[1.5rem] bg-white">
                      <Image
                        alt=""
                        aria-hidden="true"
                        className="size-6"
                        height={24}
                        src="/figma/botanical-leaf.svg"
                        unoptimized
                        width={24}
                      />
                    </div>

                    <h1 className="mt-14 max-w-[42rem] text-balance font-display text-[3rem] font-extrabold leading-[3rem] tracking-[-0.03em] text-[#1b1c17]">
                      ¡Hola!{" "}
                      <span className="text-[#274f3d]">
                        ¿Qué planta te gustaria conocer hoy?
                      </span>
                    </h1>
                    <p className="mx-auto mt-6 max-w-[32rem] text-base font-medium leading-[1.625rem] text-[#566342]">
                      Tu asistente botanico personal para diagnosticos, consejos
                      de riego y secretos de cultivo.
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center justify-center gap-3 pb-12">
                    {suggestionChips.map((chip) => (
                      <button
                        className="botanical-focus rounded-full border border-[rgba(191,201,193,0.2)] bg-white px-5 py-3 text-sm font-medium text-[#404943] transition hover:border-[rgba(39,79,61,0.2)] hover:text-[#274f3d]"
                        key={chip}
                        onClick={() => setDraftMessage(chip)}
                        type="button"
                      >
                        {chip}
                      </button>
                    ))}
                  </div>

                  <div className="grid w-full max-w-[30.4375rem] gap-4 opacity-70 sm:grid-cols-2">
                    {welcomeFeatures.map(({ body, icon: Icon, title }) => (
                      <article
                        className="rounded-2xl border border-[rgba(191,201,193,0.2)] bg-white p-6"
                        key={title}
                      >
                        <Icon className="size-5 text-[#6d8f7d]" />
                        <h2 className="mt-4 text-sm font-semibold text-[#1b1c17]">
                          {title}
                        </h2>
                        <p className="mt-1 text-xs leading-4 text-[#404943]">
                          {body}
                        </p>
                      </article>
                    ))}
                  </div>
                </>
              )}
            </div>
          </section>

          <footer className="relative border-t border-[rgba(191,201,193,0.2)] bg-white/95 px-4 py-4 backdrop-blur sm:px-6 lg:px-12">
            <div className="mx-auto w-full max-w-[56rem]">
              {selectedConversation ? (
                <ContinueConversationForm
                  conversationId={selectedConversation.id}
                  isPending={selectedConversationUiState.isSubmitting}
                  maxMessageChars={composer.maxMessageChars}
                  message={draftMessage}
                  onMessageChange={setDraftMessage}
                  onSubmitMessage={submitSelectedConversationMessage}
                />
              ) : (
                <CreateConversationForm
                  maxMessageChars={composer.maxMessageChars}
                  message={draftMessage}
                  onMessageChange={setDraftMessage}
                />
              )}
            </div>
          </footer>
        </div>
      </div>
    </main>
  );
}
