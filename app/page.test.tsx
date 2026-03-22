import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HomePageContent } from "./home-page-content";

describe("Home", () => {
  it("renders the marketing landing state for signed-out visitors", () => {
    render(<HomePageContent user={null} />);

    expect(
      screen.getByRole("heading", {
        name: /entiende tus plantas, sintoniza con la naturaleza/i,
      }),
    ).toBeInTheDocument();

    expect(
      screen.getByRole("link", {
        name: /empieza gratis/i,
      }),
    ).toBeInTheDocument();
  });

  it("keeps the landing layout for authenticated users while exposing chat and sign-out controls", () => {
    render(
      <HomePageContent
        signOutControl={<button type="button">Cerrar sesion</button>}
        user={{
          id: "google:sub_123",
          email: "ana@example.com",
          name: "Ana",
          image: null,
        }}
      />,
    );

    expect(
      screen.getAllByRole("link", {
        name: /abrir chat/i,
      }),
    ).toHaveLength(2);
    expect(
      screen.getByRole("button", {
        name: /cerrar sesion/i,
      }),
    ).toBeInTheDocument();
  });
});
