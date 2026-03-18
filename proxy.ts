import { auth } from "@/auth";
import { NextResponse, type NextRequest } from "next/server";
import {
  createRequestStart,
  REQUEST_ID_HEADER,
  REQUEST_START_HEADER,
  resolveRequestId,
} from "@/lib/observability/request-context";

export const proxy = auth((request: NextRequest) => {
  const requestHeaders = new Headers(request.headers);
  const requestId = resolveRequestId(request.headers.get(REQUEST_ID_HEADER));
  const requestStart = createRequestStart();

  requestHeaders.set(REQUEST_ID_HEADER, requestId);
  requestHeaders.set(REQUEST_START_HEADER, requestStart);

  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });

  response.headers.set(REQUEST_ID_HEADER, requestId);

  return response;
});

export const config = {
  matcher: [
    {
      source: "/((?!_next/static|_next/image|favicon.ico).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
