import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { HomePageContent } from "./home-page-content";

vi.mock("next/image", () => ({
  default: ({ alt }: { alt?: string }) => <span data-alt={alt} />,
}));

describe("Home", () => {
  it("renders the starter heading and documentation link", () => {
    render(<HomePageContent />);

    expect(
      screen.getByRole("heading", {
        name: /to get started, edit the page\.tsx file\./i,
      }),
    ).toBeInTheDocument();

    expect(
      screen.getByRole("link", {
        name: /documentation/i,
      }),
    ).toHaveAttribute("href", expect.stringContaining("nextjs.org/docs"));
  });
});
