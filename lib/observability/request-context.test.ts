import { describe, expect, it } from "vitest";
import {
  calculateLatencyMs,
  createRequestStart,
  parseRequestStart,
  resolveRequestId,
} from "./request-context";

describe("request context helpers", () => {
  it("preserves a valid incoming request id", () => {
    expect(resolveRequestId("req_12345678")).toBe("req_12345678");
  });

  it("generates a request id when the incoming value is missing or invalid", () => {
    expect(resolveRequestId(null, () => "generated-request-id")).toBe(
      "generated-request-id",
    );
    expect(resolveRequestId("not valid", () => "generated-request-id")).toBe(
      "generated-request-id",
    );
  });

  it("creates and parses request start timestamps", () => {
    expect(createRequestStart(() => 1234)).toBe("1234");
    expect(parseRequestStart("1234")).toBe(1234);
    expect(parseRequestStart("not-a-number")).toBeNull();
  });

  it("calculates latency from a valid request start and clamps invalid values", () => {
    expect(calculateLatencyMs("100", () => 160)).toBe(60);
    expect(calculateLatencyMs("200", () => 160)).toBe(0);
    expect(calculateLatencyMs("invalid", () => 160)).toBeNull();
  });
});
