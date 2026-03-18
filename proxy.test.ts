import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";
import nextConfig from "./next.config";
import { config, proxy } from "./proxy";
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
});
