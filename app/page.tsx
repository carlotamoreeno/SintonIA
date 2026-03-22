import { headers } from "next/headers";
import { after } from "next/server";
import { SignOutForm } from "@/components/auth/sign-out-form";
import { getOptionalAppSession } from "@/lib/auth/app-session";
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
  const appSession = await getOptionalAppSession();
  const requestHeaders = await headers();
  const requestId = resolveRequestId(requestHeaders.get(REQUEST_ID_HEADER));
  const requestStart = requestHeaders.get(REQUEST_START_HEADER);
  const user = appSession?.session.user
    ? {
        id: appSession.session.user.id,
        email: appSession.session.user.email ?? null,
        name: appSession.session.user.name ?? null,
        image: appSession.session.user.image ?? null,
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
      signOutControl={
        <SignOutForm buttonClassName="h-11 rounded-lg bg-white/75 px-4 text-sm shadow-none backdrop-blur hover:bg-white" />
      }
      user={user}
    />
  );
}
