import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { NextRequest } from "next/server";
import type { Session } from "next-auth";
import { describe, expect, it, vi } from "vitest";
import nextConfig from "./next.config";
import { config, proxy, UNAUTHENTICATED_API_MESSAGE } from "./proxy";
import {
  REQUEST_ID_HEADER,
  REQUEST_START_HEADER,
} from "@/lib/observability/request-context";

vi.mock("@/auth", () => ({
  auth: <
    T extends (request: NextRequest) => Response | Promise<Response> | void,
  >(
    handler: T,
  ) => handler,
}));

async function callProxy(request: NextRequest) {
  const response = await (
    proxy as unknown as (request: NextRequest) => Promise<Response> | Response
  )(request);

  if (!response) {
    throw new Error("proxy did not return a response");
  }

  return response;
}

function createAuthenticatedRequest(url: string) {
  const request = new NextRequest(url);

  Object.assign(request, {
    auth: {
      expires: "2099-01-01T00:00:00.000Z",
      user: {
        id: "google:sub_123",
        role: "admin",
        name: "Admin",
        email: "admin@example.com",
        image: null,
      },
    } satisfies Session,
  });

  return request;
}

describe("proxy", () => {
  it("matches app and api routes while excluding static assets and prefetches", () => {
    expect(
      unstable_doesMiddlewareMatch({
        config,
        nextConfig,
        url: "/",
      }),
    ).toBe(true);

    expect(
      unstable_doesMiddlewareMatch({
        config,
        nextConfig,
        url: "/api/health",
      }),
    ).toBe(true);

    expect(
      unstable_doesMiddlewareMatch({
        config,
        nextConfig,
        url: "/chat",
      }),
    ).toBe(true);

    expect(
      unstable_doesMiddlewareMatch({
        config,
        nextConfig,
        url: "/api/me",
      }),
    ).toBe(true);

    expect(
      unstable_doesMiddlewareMatch({
        config,
        nextConfig,
        url: "/_next/static/chunk.js",
      }),
    ).toBe(false);

    expect(
      unstable_doesMiddlewareMatch({
        config,
        nextConfig,
        url: "/_next/image?url=%2Fnext.svg&w=64&q=75",
      }),
    ).toBe(false);

    expect(
      unstable_doesMiddlewareMatch({
        config,
        nextConfig,
        url: "/favicon.ico",
      }),
    ).toBe(false);

    expect(
      unstable_doesMiddlewareMatch({
        config,
        nextConfig,
        url: "/",
        headers: {
          "next-router-prefetch": "1",
        },
      }),
    ).toBe(false);

    expect(
      unstable_doesMiddlewareMatch({
        config,
        nextConfig,
        url: "/",
        headers: {
          purpose: "prefetch",
        },
      }),
    ).toBe(false);
  });

  it("preserves a valid incoming request id and forwards observability headers", async () => {
    const request = new NextRequest("https://example.com/", {
      headers: {
        [REQUEST_ID_HEADER]: "req_12345678",
      },
    });
    const response = await callProxy(request);

    expect(response.headers.get(REQUEST_ID_HEADER)).toBe("req_12345678");
    expect(response.headers.get("x-middleware-override-headers")).toContain(
      REQUEST_ID_HEADER,
    );
    expect(
      response.headers.get(`x-middleware-request-${REQUEST_ID_HEADER}`),
    ).toBe("req_12345678");
    expect(
      response.headers.get(`x-middleware-request-${REQUEST_START_HEADER}`),
    ).toMatch(/^\d+$/);
  });

  it("generates a request id when the incoming header is invalid", async () => {
    const request = new NextRequest("https://example.com/", {
      headers: {
        [REQUEST_ID_HEADER]: "bad id",
      },
    });
    const response = await callProxy(request);
    const generatedRequestId = response.headers.get(REQUEST_ID_HEADER);

    expect(generatedRequestId).toMatch(/^[A-Za-z0-9][A-Za-z0-9_-]{7,127}$/);
    expect(generatedRequestId).not.toBe("bad id");
  });

  it("redirects anonymous visitors away from the protected chat page", async () => {
    const response = await callProxy(
      new NextRequest("https://example.com/chat"),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://example.com/api/auth/signin?callbackUrl=https%3A%2F%2Fexample.com%2Fchat",
    );
    expect(response.headers.get(REQUEST_ID_HEADER)).toBeTruthy();
  });

  it("returns 401 JSON for anonymous protected API requests", async () => {
    const response = await callProxy(
      new NextRequest("https://example.com/api/me"),
    );

    expect(response.status).toBe(401);
    expect(response.headers.get(REQUEST_ID_HEADER)).toBeTruthy();
    await expect(response.json()).resolves.toEqual({
      message: UNAUTHENTICATED_API_MESSAGE,
    });
  });

  it("allows authenticated requests through protected routes", async () => {
    const response = await callProxy(
      createAuthenticatedRequest("https://example.com/chat"),
    );

    expect(response.headers.get(REQUEST_ID_HEADER)).toBeTruthy();
    expect(response.headers.get("x-middleware-override-headers")).toContain(
      REQUEST_ID_HEADER,
    );
    expect(
      response.headers.get(`x-middleware-request-${REQUEST_START_HEADER}`),
    ).toMatch(/^\d+$/);
    expect(response.headers.get("location")).toBeNull();
  });
});
