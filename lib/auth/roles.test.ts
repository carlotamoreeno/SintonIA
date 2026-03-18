import { describe, expect, it } from "vitest";
import {
  isRoleAllowed,
  normalizeEmail,
  parseRoleEmailList,
  resolveUserRole,
} from "./roles";

describe("normalizeEmail", () => {
  it("normalizes casing and trims whitespace", () => {
    expect(normalizeEmail(" Admin@Example.com ")).toBe("admin@example.com");
    expect(normalizeEmail("   ")).toBeNull();
    expect(normalizeEmail(null)).toBeNull();
  });
});

describe("parseRoleEmailList", () => {
  it("deduplicates and removes blank entries", () => {
    expect(
      parseRoleEmailList(
        "expert@example.com, EXPERT@example.com, ,admin@example.com",
      ),
    ).toEqual(["expert@example.com", "admin@example.com"]);
  });
});

describe("resolveUserRole", () => {
  const allowlist = {
    expertEmails: ["expert@example.com", "shared@example.com"],
    adminEmails: ["admin@example.com", "shared@example.com"],
  };

  it("defaults to user when there is no matching email", () => {
    expect(resolveUserRole(null, allowlist)).toBe("user");
    expect(resolveUserRole("viewer@example.com", allowlist)).toBe("user");
  });

  it("resolves expert and admin roles with admin precedence", () => {
    expect(resolveUserRole("expert@example.com", allowlist)).toBe("expert");
    expect(resolveUserRole("admin@example.com", allowlist)).toBe("admin");
    expect(resolveUserRole("shared@example.com", allowlist)).toBe("admin");
  });
});

describe("isRoleAllowed", () => {
  it("treats admin as a superset of expert and user", () => {
    expect(isRoleAllowed("admin", ["expert"])).toBe(true);
    expect(isRoleAllowed("expert", ["admin"])).toBe(false);
    expect(isRoleAllowed("user", ["user"])).toBe(true);
  });
});
