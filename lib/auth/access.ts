import type { NextRequest } from "next/server";

export const UNAUTHENTICATED_API_MESSAGE = "Not authenticated";
export const DEFAULT_AUTH_REDIRECT_PATH = "/";

export function isProtectedPagePath(pathname: string) {
  return (
    pathname === "/chat" ||
    pathname.startsWith("/chat/") ||
    pathname === "/admin/knowledge" ||
    pathname.startsWith("/admin/knowledge/")
  );
}

export function isProtectedApiPath(pathname: string) {
  return (
    pathname === "/api/me" ||
    pathname.startsWith("/api/me/") ||
    pathname === "/api/chat" ||
    pathname.startsWith("/api/chat/") ||
    pathname === "/api/admin" ||
    pathname.startsWith("/api/admin/")
  );
}

export function normalizeCallbackPath(callbackPath: string | null | undefined) {
  if (typeof callbackPath !== "string" || callbackPath.length === 0) {
    return DEFAULT_AUTH_REDIRECT_PATH;
  }

  if (!callbackPath.startsWith("/") || callbackPath.startsWith("//")) {
    return DEFAULT_AUTH_REDIRECT_PATH;
  }

  try {
    const normalizedUrl = new URL(callbackPath, "https://sintonia.local");

    return `${normalizedUrl.pathname}${normalizedUrl.search}${normalizedUrl.hash}`;
  } catch {
    return DEFAULT_AUTH_REDIRECT_PATH;
  }
}

function buildRelativeCallbackPath(
  requestUrl: Pick<URL, "pathname" | "search">,
) {
  return normalizeCallbackPath(`${requestUrl.pathname}${requestUrl.search}`);
}

export function buildSignInUrl(request: NextRequest) {
  const signInUrl = request.nextUrl.clone();

  signInUrl.pathname = "/sign-in";
  signInUrl.search = "";
  signInUrl.searchParams.set(
    "callbackUrl",
    buildRelativeCallbackPath(request.nextUrl),
  );

  return signInUrl;
}

export function buildRelativeSignInUrl(callbackPath: string) {
  const searchParams = new URLSearchParams({
    callbackUrl: normalizeCallbackPath(callbackPath),
  });

  return `/sign-in?${searchParams.toString()}`;
}
