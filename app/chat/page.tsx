import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { SignOutForm } from "@/components/auth/sign-out-form";
import { buildRelativeSignInUrl } from "@/lib/auth/access";
import { ChatPageContent } from "./chat-page-content";

export const dynamic = "force-dynamic";

export default async function ChatPage() {
  const session = await auth();

  if (!session?.user) {
    redirect(buildRelativeSignInUrl("/chat"));
  }

  return (
    <ChatPageContent
      signOutControl={<SignOutForm />}
      user={{
        id: session.user.id,
        email: session.user.email ?? null,
        name: session.user.name ?? null,
        role: session.user.role,
      }}
    />
  );
}
