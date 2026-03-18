import { headers } from "next/headers";
import { after } from "next/server";
import { auth } from "@/auth";
import { GoogleSignInForm } from "@/components/auth/google-sign-in-form";
import { SignOutForm } from "@/components/auth/sign-out-form";
import {
  calculateLatencyMs,
  REQUEST_ID_HEADER,
  REQUEST_START_HEADER,
  resolveRequestId,
} from "@/lib/observability/request-context";
import { logStructuredEvent } from "@/lib/observability/logger";
import { HomePageContent } from "./home-page-content";

export const dynamic = "force-dynamic";

export default async function Home() {
  const session = await auth();
  const requestHeaders = await headers();
  const requestId = resolveRequestId(requestHeaders.get(REQUEST_ID_HEADER));
  const requestStart = requestHeaders.get(REQUEST_START_HEADER);
  const user = session?.user
    ? {
        id: session.user.id,
        email: session.user.email ?? null,
        name: session.user.name ?? null,
        image: session.user.image ?? null,
      }
    : null;

  after(() => {
    logStructuredEvent({
      event: "request_completed",
      requestId,
      route: "/",
      method: "GET",
      statusCode: 200,
      latencyMs: calculateLatencyMs(requestStart),
      userId: user?.id ?? null,
      details: {
        page: "home",
      },
    });
  });

  return (
    <HomePageContent
      signInControl={<GoogleSignInForm />}
      signOutControl={<SignOutForm />}
      user={user}
    />
  );
}
