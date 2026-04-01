"use client";

import type { ReactNode } from "react";
import { useState, useTransition } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Camera,
  Leaf,
  Menu,
  MessageSquarePlus,
  RotateCcw,
  Sprout,
  X,
} from "lucide-react";
import { SintoniaMark } from "@/components/brand/sintonia-mark";
import { SintoniaWordmark } from "@/components/brand/sintonia-wordmark";
import { SignOutForm } from "@/components/auth/sign-out-form";
import { buildRelativeSignInUrl } from "@/lib/auth/access";
import { CHAT_STREAM_ACCEPT_HEADER } from "@/lib/chat/chat-stream";
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
import { ChatAssistantMessageContent } from "./chat-assistant-message-content";
import { readChatEventStream } from "./chat-stream-client";
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
  deliveryStatus: "failed" | "pending" | "ready" | "streaming";
  errorMessage?: string | null;
  grounded?: boolean;
  id: string;
  messageId?: string;
  requestMessage?: string;
  role: "user" | "assistant" | "system";
};

type DisplayConversationMessage = {
  citations?: ChatCitation[];
  content: string;
  createdAt: string;
  deliveryStatus: "failed" | "pending" | "ready" | "streaming";
  errorMessage?: string | null;
  grounded?: boolean;
  id: string;
  messageId?: string;
  requestMessage?: string;
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
const LOCAL_CONVERSATION_ID_PREFIX = "local-conversation";
const MAX_LOCAL_CONVERSATION_TITLE_LENGTH = 80;

const suggestionChips = [
  "Cuidado de suculentas",
  "Poda de rosales",
  "Falta de luz",
  "Plagas comunes",
] as const;

const welcomeFeatures = [
  {
    body: "Sube una foto para identificar especies al instante.",
    icon: <Camera className="size-5 text-[#6d8f7d]" />,
    title: "Identificacion Visual",
  },
  {
    body: "Describe los sintomas para un diagnostico experto.",
    icon: (
      <Image
        alt=""
        aria-hidden="true"
        height={20}
        src="/ui/icons/diagnosis.svg"
        width={20}
      />
    ),
    title: "Doctor de Plantas",
  },
] as const;

const roleLabels: Record<AppRole, string> = {
  admin: "Admin Tier",
  expert: "Expert Tier",
  user: "Starter Tier",
};
export const MAX_SIDEBAR_CONVERSATION_LABEL_LENGTH = 32;

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

export function truncateSidebarConversationLabel(
  label: string,
  maxLength = MAX_SIDEBAR_CONVERSATION_LABEL_LENGTH,
) {
  const normalizedLabel = label.trim();

  if (normalizedLabel.length <= maxLength) {
    return normalizedLabel;
  }

  if (maxLength <= 3) {
    return "...".slice(0, maxLength);
  }

  return `${normalizedLabel.slice(0, maxLength - 3).trimEnd()}...`;
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

function isLocalConversationId(conversationId: string) {
  return conversationId.startsWith(`${LOCAL_CONVERSATION_ID_PREFIX}-`);
}

function normalizeLocalConversationTitle(message: string) {
  const normalizedMessage = message.trim().replace(/\s+/g, " ");

  if (normalizedMessage.length <= MAX_LOCAL_CONVERSATION_TITLE_LENGTH) {
    return normalizedMessage;
  }

  if (MAX_LOCAL_CONVERSATION_TITLE_LENGTH <= 3) {
    return "...".slice(0, MAX_LOCAL_CONVERSATION_TITLE_LENGTH);
  }

  return `${normalizedMessage
    .slice(0, MAX_LOCAL_CONVERSATION_TITLE_LENGTH - 3)
    .trimEnd()}...`;
}

function createLocalConversation(message: string) {
  const timestamp = new Date().toISOString();

  return {
    createdAt: timestamp,
    id: createTransientMessageId(LOCAL_CONVERSATION_ID_PREFIX),
    lastMessageAt: timestamp,
    messages: [],
    status: "active",
    title: normalizeLocalConversationTitle(message),
    updatedAt: timestamp,
  } satisfies PersistedConversationHistoryConversation;
}

function upsertConversationInHistory(
  history: PersistedConversationHistoryConversation[],
  conversation: PersistedConversationHistoryConversation,
) {
  return [
    conversation,
    ...history.filter(
      (existingConversation) => existingConversation.id !== conversation.id,
    ),
  ];
}

function replaceConversationIdInHistory(
  history: PersistedConversationHistoryConversation[],
  previousConversationId: string,
  nextConversationId: string,
) {
  return history.map((conversation) =>
    conversation.id === previousConversationId
      ? {
          ...conversation,
          id: nextConversationId,
        }
      : conversation,
  );
}

function mergeServerHistoryWithLocalState(
  localHistory: PersistedConversationHistoryConversation[],
  serverHistory: PersistedConversationHistoryConversation[],
) {
  const localConversationsById = new Map(
    localHistory.map((conversation) => [conversation.id, conversation]),
  );
  const serverConversationIds = new Set(
    serverHistory.map((conversation) => conversation.id),
  );
  const localOnlyConversations = localHistory.filter(
    (conversation) => !serverConversationIds.has(conversation.id),
  );

  return [
    ...localOnlyConversations,
    ...serverHistory.map(
      (conversation) =>
        localConversationsById.get(conversation.id) ?? conversation,
    ),
  ];
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
    citations: message.citations,
    content: message.content,
    createdAt: message.createdAt,
    deliveryStatus: "ready" as const,
    grounded: message.grounded,
    id: message.id,
    messageId: message.providerMessageId ?? undefined,
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

function MessageCitations({ citations }: { citations: ChatCitation[] }) {
  return (
    <section
      aria-label="Fuentes del mensaje"
      className="mt-4 rounded-[1.25rem] border border-[rgba(191,201,193,0.45)] bg-[#f7f5ee] p-4"
    >
      <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-[#566342]">
        Fuentes
      </p>
      <ol className="mt-3 space-y-3">
        {citations.map((citation, index) => (
          <li
            className="rounded-2xl border border-[rgba(191,201,193,0.35)] bg-white px-4 py-3"
            key={`${citation.fileId}-${index}`}
          >
            <p className="text-sm font-semibold text-[#274f3d]">
              {citation.documentName}
            </p>
            <CitationSnippetContent snippet={citation.snippet} />
          </li>
        ))}
      </ol>
    </section>
  );
}

function GroundingBadge({ grounded }: { grounded: boolean }) {
  const label = grounded
    ? "Con respaldo documental"
    : "Sin respaldo documental";
  const description = grounded
    ? "Respuesta sustentada en documentos del corpus."
    : "Respuesta sin respaldo documental suficiente en el corpus.";

  return (
    <span
      aria-label={description}
      className={cn(
        "mb-3 inline-flex rounded-full border px-3 py-1 text-[0.6875rem] font-semibold uppercase tracking-[0.08em]",
        grounded
          ? "border-[#bfd5c5] bg-[#edf6ef] text-[#2f6b49]"
          : "border-[#e5c99a] bg-[#fff4e2] text-[#8a5a14]",
      )}
      title={description}
    >
      {label}
    </span>
  );
}

function SidebarSvgIcon({ src }: { src: string }) {
  return <Image alt="" aria-hidden="true" height={16} src={src} width={16} />;
}

function normalizeCitationSnippet(snippet: string) {
  return snippet
    .replace(/\r\n?/g, "\n")
    .replace(/\s*([●•])\s*/g, "\n$1 ")
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => line.length > 0);
}

function isCitationSnippetHeading(line: string) {
  return !/^[●•]\s/u.test(line) && !/[.!?:]$/.test(line) && line.length <= 80;
}

function formatCitationSnippetFragment(line: string) {
  if (/^[A-ZÁÉÍÓÚÜ¿¡]/u.test(line) || line.startsWith("...")) {
    return line;
  }

  return `...${line}`;
}

function CitationSnippetContent({ snippet }: { snippet: string }) {
  const lines = normalizeCitationSnippet(snippet);
  const explicitBullets = lines
    .filter((line) => /^[●•]\s/u.test(line))
    .map((line) => line.replace(/^[●•]\s/u, "").trim());
  const plainLines = lines.filter((line) => !/^[●•]\s/u.test(line));

  const fallbackHeadingIndex =
    explicitBullets.length === 0 && plainLines.length >= 3
      ? plainLines.findIndex((line) => isCitationSnippetHeading(line))
      : -1;
  const fragmentLines =
    explicitBullets.length > 0
      ? explicitBullets
      : fallbackHeadingIndex > 0
        ? plainLines.slice(0, fallbackHeadingIndex)
        : plainLines.length >= 3
          ? plainLines.slice(0, Math.max(plainLines.length - 1, 1))
          : [];
  const headingLine =
    fallbackHeadingIndex >= 0 ? plainLines[fallbackHeadingIndex] : null;
  const paragraphLines =
    explicitBullets.length > 0
      ? plainLines
      : fallbackHeadingIndex >= 0
        ? plainLines.slice(fallbackHeadingIndex + 1)
        : plainLines.slice(fragmentLines.length);

  return (
    <div className="mt-2 max-h-56 space-y-3 overflow-y-auto pr-1 text-sm leading-6 text-[#404943]">
      {headingLine ? (
        <p className="font-semibold text-[#566342]" key="heading">
          {headingLine}
        </p>
      ) : null}
      {paragraphLines.map((paragraph, index) => (
        <p key={`paragraph-${index}`}>{paragraph}</p>
      ))}
      {fragmentLines.length > 0 ? (
        <ul className="list-disc space-y-2 pl-5 marker:text-[#566342]">
          {fragmentLines.map((bullet, index) => (
            <li className="pl-1" key={`bullet-${index}`}>
              {formatCitationSnippetFragment(bullet)}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function BotanicalWaitingIndicator() {
  return (
    <div
      aria-live="polite"
      className="inline-flex items-center gap-3 rounded-full border border-[rgba(191,201,193,0.45)] bg-[#f7f5ee] px-4 py-2 text-xs font-medium text-[#566342]"
    >
      <div className="relative flex items-center gap-1">
        <Leaf className="size-3.5 animate-[botanical-sway_1.6s_ease-in-out_infinite]" />
        <Sprout className="size-3.5 animate-[botanical-bloom_1.2s_ease-in-out_infinite]" />
      </div>
      <span>Preparando respuesta…</span>
    </div>
  );
}

function PlaceholderSidebarAction({
  children,
  icon,
}: {
  children: string;
  icon: ReactNode;
}) {
  return (
    <button
      aria-disabled="true"
      className="botanical-placeholder inline-flex h-9 w-full min-w-0 items-center gap-3 overflow-hidden rounded-lg px-3 text-left text-sm font-medium"
      disabled
      tabIndex={-1}
      type="button"
    >
      {icon}
      <span className="truncate">{children}</span>
    </button>
  );
}

function ChatSidebarContent({
  history,
  isMobile,
  onSelectConversation,
  onSelectNewChat,
  selectedConversationId,
  user,
}: {
  history: PersistedConversationHistoryConversation[];
  isMobile?: boolean;
  onSelectConversation?(conversationId: string): void;
  onSelectNewChat?(): void;
  selectedConversationId: string | null;
  user: ChatPageUser;
}) {
  return (
    <div className="flex h-full min-w-0 flex-col overflow-x-hidden p-6">
      <div className="flex items-center justify-between pb-6">
        <SintoniaWordmark className="shrink-0" />
        {isMobile ? (
          <DrawerClose
            aria-label="Cerrar menu"
            className="botanical-focus inline-flex size-10 items-center justify-center rounded-xl text-[#566342] transition hover:bg-white/70"
          >
            <X className="size-5" />
          </DrawerClose>
        ) : null}
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-4 overflow-y-auto overflow-x-hidden">
        <div className="space-y-1">
          <Link
            aria-current={selectedConversationId ? undefined : "page"}
            className={cn(
              "botanical-focus flex h-9 min-w-0 items-center gap-3 overflow-hidden rounded-lg px-3 text-sm font-medium transition",
              selectedConversationId
                ? "text-[#566342] hover:bg-white/65"
                : "bg-[#e4e2db] text-[#274f3d]",
            )}
            href="/chat"
            onClick={(event) => {
              if (!onSelectNewChat) {
                return;
              }

              event.preventDefault();
              onSelectNewChat();
            }}
          >
            <MessageSquarePlus className="size-4" />
            <span className="truncate">New Chat</span>
          </Link>

          <div className="flex h-9 min-w-0 items-center gap-3 overflow-hidden px-3 text-sm font-medium text-[#566342]">
            <SidebarSvgIcon src="/ui/icons/history.svg" />
            <span className="truncate">Botanical History</span>
          </div>
        </div>

        <div className="min-w-0 space-y-3 px-3">
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
                const conversationLabel =
                  resolveConversationLabel(conversation);
                const sidebarConversationLabel =
                  truncateSidebarConversationLabel(conversationLabel);

                return (
                  <Link
                    aria-current={isActive ? "page" : undefined}
                    className={cn(
                      "botanical-focus block w-full min-w-0 rounded-lg px-2 py-1 text-sm leading-5 transition",
                      isActive
                        ? "bg-white/80 font-medium text-[#274f3d]"
                        : "text-[#404943] hover:bg-white/65",
                    )}
                    href={`/chat?conversation=${encodeURIComponent(conversation.id)}`}
                    key={conversation.id}
                    onClick={(event) => {
                      if (!onSelectConversation) {
                        return;
                      }

                      event.preventDefault();
                      onSelectConversation(conversation.id);
                    }}
                    title={conversationLabel}
                  >
                    <span className="block truncate">
                      {sidebarConversationLabel}
                    </span>
                  </Link>
                );
              })
            )}
          </div>
        </div>

        <div className="space-y-1 pt-2">
          <PlaceholderSidebarAction
            icon={<SidebarSvgIcon src="/ui/icons/species.svg" />}
          >
            Saved Plants
          </PlaceholderSidebarAction>
          <PlaceholderSidebarAction
            icon={<SidebarSvgIcon src="/ui/icons/sun.svg" />}
          >
            Care Guides
          </PlaceholderSidebarAction>
        </div>
      </div>

      <div className="mt-6 border-t border-[rgba(191,201,193,0.3)] pt-6">
        <button
          aria-disabled="true"
          className="botanical-focus inline-flex h-11 w-full min-w-0 cursor-default items-center justify-center overflow-hidden rounded-xl bg-[#274f3d] px-4 text-sm font-semibold text-white shadow-[0_10px_15px_-3px_rgba(39,79,61,0.1),0_4px_6px_-4px_rgba(39,79,61,0.1)]"
          disabled
          tabIndex={-1}
          type="button"
        >
          <span className="truncate">Upgrade to Pro</span>
        </button>

        <div className="mt-6 space-y-1">
          <PlaceholderSidebarAction
            icon={<SidebarSvgIcon src="/ui/icons/config.svg" />}
          >
            Settings
          </PlaceholderSidebarAction>
          <PlaceholderSidebarAction
            icon={<SidebarSvgIcon src="/ui/icons/alert.svg" />}
          >
            Help
          </PlaceholderSidebarAction>
          <SignOutForm
            buttonClassName="h-9 w-full justify-start gap-3 rounded-lg border-0 bg-transparent px-3 text-sm font-medium text-[#566342] shadow-none hover:bg-white/65"
            label="Cerrar sesion"
          />
        </div>

        <div className="mt-6 flex min-w-0 items-center gap-3 px-2">
          <div className="flex size-8 items-center justify-center rounded-full bg-[#dae8be]">
            <SintoniaMark size={16} />
          </div>
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold text-[#1b1c17]">
              {roleLabels[user.role]}
            </p>
            <p className="truncate text-[0.625rem] leading-5 text-[#707973]">
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
          const isStreaming = message.deliveryStatus === "streaming";
          const citations = message.citations ?? [];
          const shouldRenderCitations =
            message.role === "assistant" && citations.length > 0;
          const shouldRenderBotanicalWaitingIndicator =
            message.role === "assistant" &&
            isPending &&
            message.content.trim().length === 0;
          const groundingState =
            typeof message.grounded === "boolean" ? message.grounded : null;
          const shouldRenderGroundingBadge =
            message.role === "assistant" &&
            message.deliveryStatus === "ready" &&
            groundingState !== null;

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
                {shouldRenderGroundingBadge ? (
                  <GroundingBadge grounded={groundingState} />
                ) : null}
                {shouldRenderBotanicalWaitingIndicator ? (
                  <BotanicalWaitingIndicator />
                ) : message.role === "assistant" ? (
                  <ChatAssistantMessageContent content={message.content} />
                ) : (
                  <p className="whitespace-pre-wrap text-sm leading-7">
                    {message.content}
                  </p>
                )}
                {message.role === "assistant" && isStreaming ? (
                  <div className="mt-3 inline-flex items-center gap-2 text-xs font-medium text-[#566342]">
                    <Leaf className="size-3.5 animate-[botanical-sway_1.6s_ease-in-out_infinite]" />
                    <span>Escribiendo…</span>
                  </div>
                ) : null}
                {shouldRenderCitations ? (
                  <MessageCitations citations={citations} />
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
  const [isRoutePending, startTransition] = useTransition();
  const [draftMessage, setDraftMessage] = useState("");
  const [localHistory, setLocalHistory] = useState<
    PersistedConversationHistoryConversation[]
  >([]);
  const [activeConversationId, setActiveConversationId] = useState<
    string | null | undefined
  >(undefined);
  const [conversationUiStateById, setConversationUiStateById] = useState<
    Record<string, ConversationUiState | undefined>
  >({});
  const displayHistory = mergeServerHistoryWithLocalState(
    localHistory,
    history,
  );
  const effectiveConversationId =
    activeConversationId === undefined
      ? selectedConversationId
      : activeConversationId;
  const selectedConversation =
    displayHistory.find(
      (conversation) => conversation.id === effectiveConversationId,
    ) ?? null;
  const hasMissingConversation =
    effectiveConversationId !== null &&
    selectedConversation === null &&
    !isRoutePending;
  const selectedConversationUiState = getConversationUiState(
    conversationUiStateById,
    effectiveConversationId,
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

  function moveConversationUiState(
    previousConversationId: string,
    nextConversationId: string,
  ) {
    if (previousConversationId === nextConversationId) {
      return;
    }

    setConversationUiStateById((currentState) => {
      const previousConversationState = currentState[previousConversationId];

      if (!previousConversationState) {
        return currentState;
      }

      const remainingState = { ...currentState };
      delete remainingState[previousConversationId];

      return {
        ...remainingState,
        [nextConversationId]:
          currentState[nextConversationId] ?? previousConversationState,
      };
    });
  }

  function upsertLocalConversation(
    conversation: PersistedConversationHistoryConversation,
  ) {
    setLocalHistory((currentHistory) =>
      upsertConversationInHistory(currentHistory, conversation),
    );
  }

  function markConversationActivity(conversationId: string, timestamp: string) {
    setLocalHistory((currentHistory) => {
      const existingConversation = currentHistory.find(
        (conversation) => conversation.id === conversationId,
      );

      if (!existingConversation) {
        return currentHistory;
      }

      return upsertConversationInHistory(currentHistory, {
        ...existingConversation,
        lastMessageAt: timestamp,
        updatedAt: timestamp,
      });
    });
  }

  function renameLocalConversation(
    previousConversationId: string,
    nextConversationId: string,
  ) {
    setLocalHistory((currentHistory) =>
      replaceConversationIdInHistory(
        currentHistory,
        previousConversationId,
        nextConversationId,
      ),
    );
  }

  function markAssistantMessageFailed(input: {
    conversationId: string;
    errorMessage: string;
    localAssistantMessageId: string;
  }) {
    updateConversationUiState(input.conversationId, (state) => ({
      isSubmitting: false,
      messages: state.messages.map((message) =>
        message.id === input.localAssistantMessageId
          ? {
              ...message,
              deliveryStatus: "failed" as const,
              errorMessage: input.errorMessage,
            }
          : message,
      ),
    }));
  }

  async function readJsonSafely(response: Response) {
    try {
      return await response.json();
    } catch {
      return null;
    }
  }

  async function sendConversationMessageStreamRequest(input: {
    conversationId?: string;
    localAssistantMessageId: string;
    localConversationId: string;
    message: string;
  }) {
    let resolvedConversationId = input.localConversationId;

    try {
      const response = await fetch("/api/chat", {
        body: JSON.stringify({
          conversationId:
            input.conversationId && !isLocalConversationId(input.conversationId)
              ? input.conversationId
              : undefined,
          message: input.message,
        }),
        headers: {
          accept: CHAT_STREAM_ACCEPT_HEADER,
          "content-type": "application/json",
        },
        method: "POST",
      });

      if (response.status === 401) {
        markAssistantMessageFailed({
          conversationId: resolvedConversationId,
          errorMessage: REAUTHENTICATION_CHAT_MESSAGE,
          localAssistantMessageId: input.localAssistantMessageId,
        });
        const callbackUrl =
          input.conversationId && !isLocalConversationId(input.conversationId)
            ? `/chat?conversation=${encodeURIComponent(input.conversationId)}`
            : "/chat";
        startTransition(() => {
          router.push(buildRelativeSignInUrl(callbackUrl));
        });
        return;
      }

      if (!response.ok) {
        const payload = await readJsonSafely(response);
        const errorMessage = getChatErrorMessage(response.status, payload);

        markAssistantMessageFailed({
          conversationId: resolvedConversationId,
          errorMessage,
          localAssistantMessageId: input.localAssistantMessageId,
        });
        return;
      }

      const responseContentType = response.headers.get("content-type") ?? "";

      if (!responseContentType.includes(CHAT_STREAM_ACCEPT_HEADER)) {
        markAssistantMessageFailed({
          conversationId: resolvedConversationId,
          errorMessage: GENERIC_CHAT_RESPONSE_ERROR_MESSAGE,
          localAssistantMessageId: input.localAssistantMessageId,
        });
        return;
      }

      let hasStreamCompleted = false;

      await readChatEventStream(response, (event) => {
        switch (event.type) {
          case "conversation": {
            if (event.conversationId === resolvedConversationId) {
              break;
            }

            moveConversationUiState(
              resolvedConversationId,
              event.conversationId,
            );
            renameLocalConversation(
              resolvedConversationId,
              event.conversationId,
            );

            setActiveConversationId(event.conversationId);

            resolvedConversationId = event.conversationId;
            startTransition(() => {
              router.replace(
                `/chat?conversation=${encodeURIComponent(event.conversationId)}`,
              );
            });
            break;
          }

          case "assistant_delta": {
            updateConversationUiState(resolvedConversationId, (state) => ({
              isSubmitting: true,
              messages: state.messages.map((message) =>
                message.id === input.localAssistantMessageId
                  ? {
                      ...message,
                      content: `${message.content}${event.delta}`,
                      deliveryStatus: "streaming" as const,
                      errorMessage: null,
                    }
                  : message,
              ),
            }));
            break;
          }

          case "done": {
            hasStreamCompleted = true;
            const completedAt = new Date().toISOString();

            updateConversationUiState(resolvedConversationId, (state) => ({
              isSubmitting: false,
              messages: state.messages.map((message) =>
                message.id === input.localAssistantMessageId
                  ? {
                      ...message,
                      citations: event.citations,
                      content: event.text,
                      deliveryStatus: "ready" as const,
                      errorMessage: null,
                      grounded: event.grounded,
                      messageId: event.messageId,
                    }
                  : message,
              ),
            }));
            markConversationActivity(resolvedConversationId, completedAt);
            break;
          }

          case "error": {
            markAssistantMessageFailed({
              conversationId: resolvedConversationId,
              errorMessage: event.message,
              localAssistantMessageId: input.localAssistantMessageId,
            });
            hasStreamCompleted = true;
            break;
          }
        }
      });

      if (!hasStreamCompleted) {
        markAssistantMessageFailed({
          conversationId: resolvedConversationId,
          errorMessage: GENERIC_CHAT_REQUEST_ERROR_MESSAGE,
          localAssistantMessageId: input.localAssistantMessageId,
        });
      }
    } catch {
      markAssistantMessageFailed({
        conversationId: resolvedConversationId,
        errorMessage: GENERIC_CHAT_REQUEST_ERROR_MESSAGE,
        localAssistantMessageId: input.localAssistantMessageId,
      });
    }
  }

  function submitConversationMessage(input: {
    appendUserMessage?: boolean;
    conversationId?: string;
    localAssistantMessageId?: string;
    message: string;
  }) {
    const shouldAppendUserMessage = input.appendUserMessage ?? true;
    const currentConversationId =
      input.conversationId ?? createLocalConversation(input.message).id;
    const isExistingConversation = input.conversationId !== undefined;
    const conversationUiState = getConversationUiState(
      conversationUiStateById,
      currentConversationId,
    );

    if (conversationUiState.isSubmitting) {
      return false;
    }

    const timestamp = new Date().toISOString();
    const localAssistantMessageId =
      input.localAssistantMessageId ??
      createTransientMessageId("assistant-message");

    if (!isExistingConversation) {
      const localConversation = {
        ...createLocalConversation(input.message),
        id: currentConversationId,
      };
      upsertLocalConversation(localConversation);
      setActiveConversationId(localConversation.id);
    } else {
      markConversationActivity(currentConversationId, timestamp);
      setActiveConversationId(currentConversationId);
    }

    updateConversationUiState(currentConversationId, (state) => ({
      isSubmitting: true,
      messages: input.localAssistantMessageId
        ? state.messages.map((message) =>
            message.id === input.localAssistantMessageId
              ? {
                  ...message,
                  citations: [],
                  content: "",
                  deliveryStatus: "pending" as const,
                  errorMessage: null,
                  grounded: undefined,
                  messageId: undefined,
                  requestMessage: input.message,
                }
              : message,
          )
        : [
            ...state.messages,
            ...(shouldAppendUserMessage
              ? [
                  {
                    content: input.message,
                    createdAt: timestamp,
                    deliveryStatus: "ready" as const,
                    errorMessage: null,
                    id: createTransientMessageId("user-message"),
                    role: "user" as const,
                  },
                ]
              : []),
            {
              citations: [],
              content: "",
              createdAt: timestamp,
              deliveryStatus: "pending" as const,
              errorMessage: null,
              id: localAssistantMessageId,
              requestMessage: input.message,
              role: "assistant" as const,
            },
          ],
    }));

    void sendConversationMessageStreamRequest({
      conversationId: input.conversationId,
      localAssistantMessageId,
      localConversationId: currentConversationId,
      message: input.message,
    });

    return true;
  }

  function retrySelectedConversationMessage(localMessageId: string) {
    if (!activeConversationId || selectedConversationUiState.isSubmitting) {
      return;
    }

    const failedMessage = selectedConversationUiState.messages.find(
      (message) =>
        message.id === localMessageId &&
        message.role === "assistant" &&
        message.deliveryStatus === "failed" &&
        typeof message.requestMessage === "string" &&
        message.requestMessage.trim().length > 0,
    );

    if (!failedMessage) {
      return;
    }

    void submitConversationMessage({
      appendUserMessage: false,
      conversationId: activeConversationId,
      localAssistantMessageId: localMessageId,
      message: failedMessage.requestMessage ?? "",
    });
  }

  function handleSelectConversation(nextConversationId: string) {
    setActiveConversationId(nextConversationId);
    startTransition(() => {
      router.push(
        `/chat?conversation=${encodeURIComponent(nextConversationId)}`,
      );
    });
  }

  function handleSelectNewChat() {
    setLocalHistory((currentHistory) =>
      currentHistory.filter(
        (conversation) => !isLocalConversationId(conversation.id),
      ),
    );
    setConversationUiStateById((currentState) =>
      Object.fromEntries(
        Object.entries(currentState).filter(
          ([conversationId]) => !isLocalConversationId(conversationId),
        ),
      ),
    );
    setActiveConversationId(null);
    startTransition(() => {
      router.replace("/chat");
    });
  }

  return (
    <main className="min-h-screen bg-[#fbf9f1] text-[#1b1c17] lg:h-screen">
      <div className="flex min-h-screen lg:h-screen">
        <aside className="hidden h-screen w-72 shrink-0 border-r border-[rgba(191,201,193,0.2)] bg-[#f0eee6] lg:flex">
          <ChatSidebarContent
            history={displayHistory}
            onSelectConversation={handleSelectConversation}
            onSelectNewChat={handleSelectNewChat}
            selectedConversationId={effectiveConversationId}
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
                  history={displayHistory}
                  isMobile
                  onSelectConversation={handleSelectConversation}
                  onSelectNewChat={handleSelectNewChat}
                  selectedConversationId={effectiveConversationId}
                  user={user}
                />
              </DrawerContent>
            </Drawer>

            <SintoniaWordmark className="scale-90 origin-left" />

            <Link
              className="botanical-focus inline-flex items-center gap-2 rounded-xl bg-[#274f3d] px-4 py-2.5 text-sm font-semibold text-white"
              href="/chat"
              onClick={(event) => {
                event.preventDefault();
                handleSelectNewChat();
              }}
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
                      <SintoniaMark size={24} />
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
                    {welcomeFeatures.map(({ body, icon, title }) => (
                      <article
                        className="rounded-2xl border border-[rgba(191,201,193,0.2)] bg-white p-6"
                        key={title}
                      >
                        {icon}
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
                  onSubmitMessage={({ conversationId, message }) =>
                    submitConversationMessage({
                      conversationId,
                      message,
                    })
                  }
                />
              ) : (
                <CreateConversationForm
                  isPending={false}
                  maxMessageChars={composer.maxMessageChars}
                  message={draftMessage}
                  onMessageChange={setDraftMessage}
                  onSubmitMessage={({ message }) =>
                    submitConversationMessage({
                      message,
                    })
                  }
                />
              )}
            </div>
          </footer>
        </div>
      </div>
    </main>
  );
}
