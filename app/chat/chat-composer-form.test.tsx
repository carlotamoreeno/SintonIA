import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ChatComposerForm } from "./chat-composer-form";

function renderComposer() {
  const onSubmit = vi.fn((event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
  });

  render(
    <ChatComposerForm
      error={null}
      formId="chat-composer-test"
      isPending={false}
      maxMessageChars={4000}
      message="Consulta"
      onMessageChange={vi.fn()}
      onSubmit={onSubmit}
      submitIdleLabel="Enviar mensaje"
      submitPendingLabel="Enviando mensaje"
    />,
  );

  return {
    onSubmit,
    textarea: screen.getByRole("textbox", {
      name: /escribe tu duda aqui/i,
    }),
  };
}

describe("ChatComposerForm", () => {
  it("submits the form when pressing Enter", () => {
    const { onSubmit, textarea } = renderComposer();

    fireEvent.keyDown(textarea, {
      key: "Enter",
    });

    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("does not submit the form when pressing Shift+Enter", () => {
    const { onSubmit, textarea } = renderComposer();

    fireEvent.keyDown(textarea, {
      key: "Enter",
      shiftKey: true,
    });

    expect(onSubmit).not.toHaveBeenCalled();
  });
});
