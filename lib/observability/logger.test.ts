import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildStructuredLogEntry,
  logStructuredEvent,
  pseudonymizeUserId,
  serializeStructuredLogEntry,
} from "./logger";

describe("structured logger", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("pseudonymizes user ids deterministically when a secret is available", () => {
    const firstHash = pseudonymizeUserId("user-123", "auth-secret");
    const secondHash = pseudonymizeUserId("user-123", "auth-secret");

    expect(firstHash).toBe(secondHash);
    expect(firstHash).not.toBe("user-123");
  });

  it("redacts a user id when the secret is unavailable", () => {
    expect(pseudonymizeUserId("user-123", "")).toBe("redacted");
    expect(pseudonymizeUserId(null, "auth-secret")).toBeNull();
  });

  it("serializes the log contract without leaking the raw user id or secret", () => {
    const entry = buildStructuredLogEntry({
      event: "request_completed",
      requestId: "req_12345678",
      route: "/",
      method: "GET",
      statusCode: 200,
      latencyMs: 24,
      userId: "user-123",
      details: {
        page: "home",
      },
      secret: "super-secret",
      now: new Date("2026-03-18T16:20:00.000Z"),
    });
    const serializedEntry = serializeStructuredLogEntry(entry);

    expect(serializedEntry).not.toContain("user-123");
    expect(serializedEntry).not.toContain("super-secret");
    expect(entry).toEqual({
      timestamp: "2026-03-18T16:20:00.000Z",
      level: "info",
      event: "request_completed",
      request_id: "req_12345678",
      route: "/",
      method: "GET",
      status_code: 200,
      latency_ms: 24,
      user_id: expect.any(String),
      details: {
        page: "home",
      },
    });
  });

  it("writes info events to console.info", () => {
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});

    logStructuredEvent({
      event: "request_completed",
      requestId: "req_12345678",
      route: "/",
      method: "GET",
      statusCode: 200,
      latencyMs: 10,
      details: {
        page: "home",
      },
      now: new Date("2026-03-18T16:21:00.000Z"),
    });

    expect(infoSpy).toHaveBeenCalledOnce();
    expect(infoSpy.mock.calls[0]?.[0]).toContain('"request_id":"req_12345678"');
  });
});
