import { describe, expect, it } from "vitest";
import { isProtectedApiPath } from "./access";

describe("isProtectedApiPath", () => {
  it("protects /api/me and nested routes", () => {
    expect(isProtectedApiPath("/api/me")).toBe(true);
    expect(isProtectedApiPath("/api/me/export")).toBe(true);
  });

  it("protects /api/chat and nested routes", () => {
    expect(isProtectedApiPath("/api/chat")).toBe(true);
    expect(isProtectedApiPath("/api/chat/history")).toBe(true);
  });

  it("does not protect unrelated routes", () => {
    expect(isProtectedApiPath("/api/public")).toBe(false);
  });
});
