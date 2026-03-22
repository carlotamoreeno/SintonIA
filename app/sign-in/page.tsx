import { redirect } from "next/navigation";
import { getOptionalAppSession } from "@/lib/auth/app-session";
import {
  DEFAULT_AUTH_REDIRECT_PATH,
  normalizeCallbackPath,
} from "@/lib/auth/access";
import { SignInPageContent } from "./sign-in-page-content";

export const dynamic = "force-dynamic";

type SignInPageProps = {
  searchParams: Promise<{
    callbackUrl?: string;
  }>;
};

export default async function SignInPage({ searchParams }: SignInPageProps) {
  const { callbackUrl } = await searchParams;
  const normalizedCallbackUrl = normalizeCallbackPath(callbackUrl);
  const appSession = await getOptionalAppSession();

  if (appSession?.session.user) {
    redirect(normalizedCallbackUrl || DEFAULT_AUTH_REDIRECT_PATH);
  }

  return <SignInPageContent callbackUrl={normalizedCallbackUrl} />;
}
