import { redirect } from "next/navigation";
import { SignOutForm } from "@/components/auth/sign-out-form";
import { buildRelativeSignInUrl } from "@/lib/auth/access";
import { getOptionalAppSession } from "@/lib/auth/app-session";
import { ChatPageContent } from "./chat-page-content";

export const dynamic = "force-dynamic";

export default async function ChatPage() {
  const appSession = await getOptionalAppSession();

  if (!appSession?.session.user) {
    redirect(buildRelativeSignInUrl("/chat"));
  }

  return (
    <ChatPageContent
      signOutControl={<SignOutForm />}
      user={{
        id: appSession.session.user.id,
        email: appSession.session.user.email ?? null,
        name: appSession.session.user.name ?? null,
        role: appSession.session.user.role,
      }}
    />
  );
}
