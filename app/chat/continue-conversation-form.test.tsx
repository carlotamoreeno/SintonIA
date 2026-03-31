import * as React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ContinueConversationForm } from "./continue-conversation-form";

function ControlledContinueConversationHarness({
  isPending = false,
  onSubmitMessage = vi.fn(() => true),
}: {
  isPending?: boolean;
  onSubmitMessage?: (input: {
    conversationId: string;
    message: string;
  }) => boolean;
}) {
  const [message, setMessage] = React.useState("");

  return (
    <ContinueConversationForm
      conversationId="conversation-1"
      isPending={isPending}
      maxMessageChars={4000}
      message={message}
      onMessageChange={setMessage}
      onSubmitMessage={onSubmitMessage}
    />
  );
}

describe("ContinueConversationForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows a validation error when the message is empty after trimming", () => {
    const onSubmitMessage = vi.fn(() => true);
    render(
      <ControlledContinueConversationHarness
        onSubmitMessage={onSubmitMessage}
      />,
    );

    fireEvent.change(screen.getByRole("textbox"), {
      target: {
        value: "   ",
      },
    });
    fireEvent.click(
      screen.getByRole("button", {
        name: /enviar mensaje/i,
      }),
    );

    expect(onSubmitMessage).not.toHaveBeenCalled();
    expect(
      screen.getByText("Escribe un mensaje para continuar la conversacion."),
    ).toBeInTheDocument();
  });

  it("submits trimmed follow-ups and clears the draft when the request is accepted", () => {
    const onSubmitMessage = vi.fn(() => true);
    render(
      <ControlledContinueConversationHarness
        onSubmitMessage={onSubmitMessage}
      />,
    );

    const textarea = screen.getByRole("textbox", {
      name: /escribe tu duda aqui/i,
    });

    fireEvent.change(textarea, {
      target: {
        value: "  Necesita mas humedad  ",
      },
    });
    fireEvent.click(
      screen.getByRole("button", {
        name: /enviar mensaje/i,
      }),
    );

    expect(onSubmitMessage).toHaveBeenCalledWith({
      conversationId: "conversation-1",
      message: "Necesita mas humedad",
    });
    expect(textarea).toHaveValue("");
  });

  it("keeps the draft when the parent rejects the submit attempt", () => {
    const onSubmitMessage = vi.fn(() => false);
    render(
      <ControlledContinueConversationHarness
        onSubmitMessage={onSubmitMessage}
      />,
    );

    const textarea = screen.getByRole("textbox", {
      name: /escribe tu duda aqui/i,
    });

    fireEvent.change(textarea, {
      target: {
        value: "Seguimiento bloqueado",
      },
    });
    fireEvent.click(
      screen.getByRole("button", {
        name: /enviar mensaje/i,
      }),
    );

    expect(onSubmitMessage).toHaveBeenCalledWith({
      conversationId: "conversation-1",
      message: "Seguimiento bloqueado",
    });
    expect(textarea).toHaveValue("Seguimiento bloqueado");
  });
});
