import { redirect } from "next/navigation";
import { buildRelativeSignInUrl } from "@/lib/auth/access";
import { getOptionalAppSession } from "@/lib/auth/app-session";
import { chatRuntimeEnv } from "@/lib/chat/env";
import { conversationStore } from "@/lib/supabase/conversation-store";
import { ChatPageContent } from "./chat-page-content";

export const dynamic = "force-dynamic";

type ChatPageProps = {
  searchParams: Promise<{
    conversation?: string;
  }>;
};

export default async function ChatPage({ searchParams }: ChatPageProps) {
  const { conversation } = await searchParams;
  const appSession = await getOptionalAppSession();

  if (!appSession?.session.user) {
    redirect(
      buildRelativeSignInUrl(
        conversation
          ? `/chat?conversation=${encodeURIComponent(conversation)}`
          : "/chat",
      ),
    );
  }

  const history = await conversationStore.listConversationHistoryForUser(
    appSession.persistedIdentity.user.id,
  );

  return (
    <ChatPageContent
      composer={{
        maxMessageChars: chatRuntimeEnv.maxMessageChars,
      }}
      history={history}
      selectedConversationId={
        typeof conversation === "string" ? conversation : null
      }
      user={{
        id: appSession.session.user.id,
        email: appSession.session.user.email ?? null,
        name: appSession.session.user.name ?? null,
        role: appSession.session.user.role,
      }}
    />
  );
}
