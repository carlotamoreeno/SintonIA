import { headers } from "next/headers";
import { after } from "next/server";
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
  const requestHeaders = await headers();
  const requestId = resolveRequestId(requestHeaders.get(REQUEST_ID_HEADER));
  const requestStart = requestHeaders.get(REQUEST_START_HEADER);

  after(() => {
    logStructuredEvent({
      event: "request_completed",
      requestId,
      route: "/",
      method: "GET",
      statusCode: 200,
      latencyMs: calculateLatencyMs(requestStart),
      userId: null,
      details: {
        page: "home",
      },
    });
  });

  return <HomePageContent />;
}
