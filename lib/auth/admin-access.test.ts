import { describe, expect, it } from "vitest";
import { canAccessDocumentaryAdmin } from "./admin-access";

describe("canAccessDocumentaryAdmin", () => {
  it("allows persisted expert and admin roles", () => {
    expect(canAccessDocumentaryAdmin("expert")).toBe(true);
    expect(canAccessDocumentaryAdmin("admin")).toBe(true);
  });

  it("denies regular users", () => {
    expect(canAccessDocumentaryAdmin("user")).toBe(false);
  });
});
