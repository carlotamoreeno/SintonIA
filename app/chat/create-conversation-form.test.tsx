import * as React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CreateConversationForm } from "./create-conversation-form";

function ControlledCreateConversationHarness({
  isPending = false,
  onSubmitMessage = vi.fn(() => true),
}: {
  isPending?: boolean;
  onSubmitMessage?: (input: { message: string }) => boolean;
}) {
  const [message, setMessage] = React.useState("");

  return (
    <CreateConversationForm
      isPending={isPending}
      maxMessageChars={4000}
      message={message}
      onMessageChange={setMessage}
      onSubmitMessage={onSubmitMessage}
    />
  );
}

describe("CreateConversationForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("keeps the typed draft after rerenders", () => {
    render(<ControlledCreateConversationHarness />);

    const textarea = screen.getByRole("textbox", {
      name: /escribe tu duda aqui/i,
    });

    fireEvent.change(textarea, {
      target: {
        value: "Consulta estable",
      },
    });

    expect(textarea).toHaveValue("Consulta estable");
  });

  it("shows a validation error when the message is empty after trimming", () => {
    const onSubmitMessage = vi.fn(() => true);
    render(
      <ControlledCreateConversationHarness onSubmitMessage={onSubmitMessage} />,
    );

    fireEvent.change(screen.getByRole("textbox"), {
      target: {
        value: "   ",
      },
    });
    fireEvent.click(
      screen.getByRole("button", {
        name: /crear conversacion/i,
      }),
    );

    expect(onSubmitMessage).not.toHaveBeenCalled();
    expect(
      screen.getByText("Escribe un mensaje para iniciar la conversacion."),
    ).toBeInTheDocument();
  });

  it("submits trimmed first turns and clears the draft when the request is accepted", () => {
    const onSubmitMessage = vi.fn(() => true);
    render(
      <ControlledCreateConversationHarness onSubmitMessage={onSubmitMessage} />,
    );

    const textarea = screen.getByRole("textbox", {
      name: /escribe tu duda aqui/i,
    });

    fireEvent.change(textarea, {
      target: {
        value: "  Consulta de arranque  ",
      },
    });
    fireEvent.click(
      screen.getByRole("button", {
        name: /crear conversacion/i,
      }),
    );

    expect(onSubmitMessage).toHaveBeenCalledWith({
      message: "Consulta de arranque",
    });
    expect(textarea).toHaveValue("");
  });
});
