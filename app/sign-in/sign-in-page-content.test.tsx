import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SignInPageContent } from "./sign-in-page-content";

vi.mock("@/components/auth/google-sign-in-form", () => ({
  GoogleSignInForm: ({ callbackUrl }: { callbackUrl: string }) => (
    <form>
      <input type="hidden" value={callbackUrl} />
      <button type="submit">Google</button>
    </form>
  ),
}));

describe("SignInPageContent", () => {
  it("renders the custom sign-in screen and preserves the callback URL", () => {
    render(<SignInPageContent callbackUrl="/chat?conversation=abc123" />);

    expect(
      screen.getByRole("heading", {
        name: /bienvenido/i,
      }),
    ).toBeInTheDocument();

    expect(
      screen.getByDisplayValue("/chat?conversation=abc123"),
    ).toHaveAttribute("type", "hidden");

    expect(
      screen.getByRole("button", {
        name: /google/i,
      }),
    ).toBeInTheDocument();
  });
});
