import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HomePageContent } from "./home-page-content";

describe("Home", () => {
  it("renders the Google sign-in control for signed-out visitors", () => {
    render(
      <HomePageContent
        signInControl={<button type="button">Continuar con Google</button>}
        user={null}
      />,
    );

    expect(
      screen.getByRole("heading", {
        name: /sintonia prepara un acceso oauth limpio/i,
      }),
    ).toBeInTheDocument();

    expect(
      screen.getByRole("button", {
        name: /continuar con google/i,
      }),
    ).toBeInTheDocument();
  });

  it("renders the authenticated user state and sign-out control", () => {
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

    expect(screen.getByText("Ana")).toBeInTheDocument();
    expect(screen.getByText("ana@example.com")).toBeInTheDocument();
    expect(screen.getByText("google:sub_123")).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: /cerrar sesion/i,
      }),
    ).toBeInTheDocument();
  });
});
