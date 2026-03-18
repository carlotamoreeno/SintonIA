import type { NextAuthRequest } from "next-auth";
import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import {
  buildSignInUrl,
  isProtectedApiPath,
  isProtectedPagePath,
  UNAUTHENTICATED_API_MESSAGE,
} from "@/lib/auth/access";
import {
  createRequestStart,
  REQUEST_ID_HEADER,
  REQUEST_START_HEADER,
  resolveRequestId,
} from "@/lib/observability/request-context";

function withRequestId(response: NextResponse, requestId: string) {
  response.headers.set(REQUEST_ID_HEADER, requestId);

  return response;
}

function redirectToSignIn(request: NextRequest, requestId: string) {
  return withRequestId(
    NextResponse.redirect(buildSignInUrl(request)),
    requestId,
  );
}

function respondUnauthorized(requestId: string) {
  return withRequestId(
    NextResponse.json(
      {
        message: UNAUTHENTICATED_API_MESSAGE,
      },
      { status: 401 },
    ),
    requestId,
  );
}

export const proxy = auth((request: NextAuthRequest) => {
  const requestHeaders = new Headers(request.headers);
  const requestId = resolveRequestId(request.headers.get(REQUEST_ID_HEADER));
  const requestStart = createRequestStart();
  const pathname = request.nextUrl.pathname;

  requestHeaders.set(REQUEST_ID_HEADER, requestId);
  requestHeaders.set(REQUEST_START_HEADER, requestStart);

  if (!request.auth) {
    if (isProtectedApiPath(pathname)) {
      return respondUnauthorized(requestId);
    }

    if (isProtectedPagePath(pathname)) {
      return redirectToSignIn(request, requestId);
    }
  }

  return withRequestId(
    NextResponse.next({
      request: {
        headers: requestHeaders,
      },
    }),
    requestId,
  );
});

export { UNAUTHENTICATED_API_MESSAGE };

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
