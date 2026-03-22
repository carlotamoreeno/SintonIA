"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  BadgeHelp,
  Camera,
  History,
  Leaf,
  type LucideIcon,
  Menu,
  MessageSquarePlus,
  Settings,
  Sprout,
  Stethoscope,
  X,
} from "lucide-react";
import { SignOutForm } from "@/components/auth/sign-out-form";
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
import { CreateConversationForm } from "./create-conversation-form";

export type ChatPageUser = {
  id: string;
  email: string | null;
  name: string | null;
  role: AppRole;
};

type ChatPageContentProps = {
  composer: {
    maxMessageChars: number;
  };
  history: PersistedConversationHistoryConversation[];
  selectedConversationId: string | null;
  user: ChatPageUser;
};

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
}: {
  conversation: PersistedConversationHistoryConversation;
}) {
  return (
    <div className="w-full max-w-[48rem] space-y-6 py-8">
      <header className="botanical-surface rounded-[2rem] p-8">
        <div className="flex flex-wrap items-center gap-3 text-xs uppercase tracking-[0.12em] text-[#707973]">
          <span className="rounded-full border border-[rgba(191,201,193,0.55)] bg-[#f6f4ec] px-3 py-1 font-semibold text-[#566342]">
            {conversation.status}
          </span>
          <span>{conversation.messages.length} mensajes</span>
          <span>
            {formatTimestamp(
              conversation.lastMessageAt ?? conversation.updatedAt,
            )}
          </span>
        </div>
        <h1 className="mt-5 font-display text-[2.125rem] font-extrabold leading-[2.5rem] tracking-[-0.03em] text-[#274f3d]">
          {resolveConversationLabel(conversation)}
        </h1>
      </header>

      <div className="space-y-4">
        {conversation.messages.map((message) => {
          const isUser = message.role === "user";

          return (
            <div
              className={cn("flex", isUser ? "justify-end" : "justify-start")}
              key={message.id}
            >
              <article
                className={cn(
                  "max-w-[42rem] rounded-[1.5rem] px-5 py-4 shadow-[0_10px_15px_-3px_rgba(39,79,61,0.06),0_4px_6px_-4px_rgba(39,79,61,0.06)]",
                  isUser
                    ? "bg-[#274f3d] text-white"
                    : message.role === "assistant"
                      ? "border border-[rgba(191,201,193,0.35)] bg-white text-[#1b1c17]"
                      : "bg-[#f0eee6] text-[#404943]",
                )}
              >
                <div
                  className={cn(
                    "mb-2 flex items-center gap-3 text-[0.6875rem] uppercase tracking-[0.12em]",
                    isUser ? "text-white/75" : "text-[#707973]",
                  )}
                >
                  <span>{message.role}</span>
                  <span>{formatTimestamp(message.createdAt)}</span>
                </div>
                <p className="whitespace-pre-wrap text-sm leading-7">
                  {message.content}
                </p>
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
  const [draftMessage, setDraftMessage] = useState("");
  const selectedConversation =
    history.find(
      (conversation) => conversation.id === selectedConversationId,
    ) ?? null;
  const hasMissingConversation =
    selectedConversationId !== null && selectedConversation === null;

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
                <ConversationView conversation={selectedConversation} />
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
              <CreateConversationForm
                maxMessageChars={composer.maxMessageChars}
                message={draftMessage}
                onMessageChange={setDraftMessage}
              />
            </div>
          </footer>
        </div>
      </div>
    </main>
  );
}
