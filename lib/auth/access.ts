import type { NextRequest } from "next/server";

export const UNAUTHENTICATED_API_MESSAGE = "Not authenticated";

export function isProtectedPagePath(pathname: string) {
  return pathname === "/chat" || pathname.startsWith("/chat/");
}

export function isProtectedApiPath(pathname: string) {
  return pathname === "/api/me" || pathname.startsWith("/api/me/");
}

export function buildSignInUrl(request: NextRequest) {
  const signInUrl = request.nextUrl.clone();

  signInUrl.pathname = "/api/auth/signin";
  signInUrl.search = "";
  signInUrl.searchParams.set("callbackUrl", request.nextUrl.href);

  return signInUrl;
}

export function buildRelativeSignInUrl(callbackPath: string) {
  const searchParams = new URLSearchParams({
    callbackUrl: callbackPath,
  });

  return `/api/auth/signin?${searchParams.toString()}`;
}
