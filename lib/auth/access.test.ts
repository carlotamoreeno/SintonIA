import { describe, expect, it } from "vitest";
import { isProtectedApiPath, isProtectedPagePath } from "./access";

describe("isProtectedPagePath", () => {
  it("protects /chat and nested routes", () => {
    expect(isProtectedPagePath("/chat")).toBe(true);
    expect(isProtectedPagePath("/chat/conversation")).toBe(true);
  });

  it("protects the documentary admin route and nested routes", () => {
    expect(isProtectedPagePath("/admin/knowledge")).toBe(true);
    expect(isProtectedPagePath("/admin/knowledge/imports")).toBe(true);
  });

  it("does not protect unrelated pages", () => {
    expect(isProtectedPagePath("/")).toBe(false);
    expect(isProtectedPagePath("/admin")).toBe(false);
  });
});

describe("isProtectedApiPath", () => {
  it("protects /api/me and nested routes", () => {
    expect(isProtectedApiPath("/api/me")).toBe(true);
    expect(isProtectedApiPath("/api/me/export")).toBe(true);
  });

  it("protects /api/chat and nested routes", () => {
    expect(isProtectedApiPath("/api/chat")).toBe(true);
    expect(isProtectedApiPath("/api/chat/history")).toBe(true);
  });

  it("protects /api/admin and nested routes", () => {
    expect(isProtectedApiPath("/api/admin")).toBe(true);
    expect(isProtectedApiPath("/api/admin/knowledge")).toBe(true);
  });

  it("does not protect unrelated routes", () => {
    expect(isProtectedApiPath("/api/public")).toBe(false);
  });
});
