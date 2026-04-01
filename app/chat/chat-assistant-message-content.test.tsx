import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ChatAssistantMessageContent } from "./chat-assistant-message-content";

describe("ChatAssistantMessageContent", () => {
  it("renders a simple paragraph without formatting", () => {
    render(
      <ChatAssistantMessageContent content="Texto simple del asistente." />,
    );

    expect(screen.getByText("Texto simple del asistente.")).toBeInTheDocument();
    expect(screen.queryByText(/.+/, { selector: "strong" })).toBeNull();
  });

  it("renders bold segments inside a paragraph", () => {
    render(
      <ChatAssistantMessageContent content="Aplica **riego moderado** y **luz indirecta**." />,
    );

    expect(
      screen.getByText("riego moderado", {
        selector: "strong",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("luz indirecta", {
        selector: "strong",
      }),
    ).toBeInTheDocument();
  });

  it("renders unordered and ordered lists", () => {
    render(
      <ChatAssistantMessageContent
        content={[
          "Pasos recomendados:",
          "",
          "- Revisa la humedad",
          "- Ajusta el riego",
          "",
          "1. Observa las hojas",
          "2. Repite en una semana",
        ].join("\n")}
      />,
    );

    const lists = screen.getAllByRole("list");

    expect(lists).toHaveLength(2);
    expect(within(lists[0]).getAllByRole("listitem")).toHaveLength(2);
    expect(within(lists[1]).getAllByRole("listitem")).toHaveLength(2);
  });

  it("accepts safe aliases for bold and list markers", () => {
    render(
      <ChatAssistantMessageContent
        content={[
          "Aplica __riego moderado__.",
          "",
          "* Primer punto",
          "• Segundo punto",
          "",
          "1) Observa las hojas",
        ].join("\n")}
      />,
    );

    expect(
      screen.getByText("riego moderado", {
        selector: "strong",
      }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("list")).toHaveLength(2);
  });

  it("renders paragraphs and lists as separate blocks", () => {
    const { container } = render(
      <ChatAssistantMessageContent
        content={[
          "Resumen inicial.",
          "",
          "- Punto uno",
          "- Punto dos",
          "",
          "Cierre final.",
        ].join("\n")}
      />,
    );

    expect(container.querySelectorAll("p")).toHaveLength(2);
    expect(container.querySelectorAll("ul")).toHaveLength(1);
  });

  it("keeps unmatched bold markers as literal text", () => {
    render(
      <ChatAssistantMessageContent content="Esto queda abierto en streaming: **riego" />,
    );

    expect(
      screen.getByText("Esto queda abierto en streaming: **riego"),
    ).toBeInTheDocument();
    expect(screen.queryByText("riego", { selector: "strong" })).toBeNull();
  });

  it("shows HTML literally instead of interpreting it", () => {
    const { container } = render(
      <ChatAssistantMessageContent content="<strong>No es HTML</strong>" />,
    );

    expect(screen.getByText("<strong>No es HTML</strong>")).toBeInTheDocument();
    expect(container.querySelector("strong")).toBeNull();
  });

  it("shows unsupported markdown syntax as literal text", () => {
    render(
      <ChatAssistantMessageContent
        content={"# Titulo\n\n`codigo` y [enlace](https://example.com)"}
      />,
    );

    expect(screen.getByText("# Titulo")).toBeInTheDocument();
    expect(
      screen.getByText("`codigo` y [enlace](https://example.com)"),
    ).toBeInTheDocument();
  });

  it("hides persisted provider file citation artifacts before rendering", () => {
    render(
      <ChatAssistantMessageContent content="Consejo útil. fileciteturn0file8turn0file9" />,
    );

    expect(screen.getByText("Consejo útil.")).toBeInTheDocument();
    expect(screen.queryByText(/filecite/i)).toBeNull();
  });
});
