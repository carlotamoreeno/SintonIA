import * as React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CreateConversationForm } from "./create-conversation-form";

const useActionStateMock = vi.hoisted(() => vi.fn());

vi.mock("react", async () => {
  const actual = await vi.importActual<typeof import("react")>("react");

  return {
    ...actual,
    useActionState: useActionStateMock,
  };
});

vi.mock("./actions", () => ({
  createConversationAction: vi.fn(),
}));

type MockCreateConversationFormState = {
  error: string | null;
  message: string;
};

const formActionMock = vi.fn();
let mockFormState: MockCreateConversationFormState;

function ControlledComposerHarness() {
  const [message, setMessage] = React.useState("");

  return (
    <CreateConversationForm
      maxMessageChars={4000}
      message={message}
      onMessageChange={setMessage}
    />
  );
}

describe("CreateConversationForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFormState = {
      error: null,
      message: "",
    };

    useActionStateMock.mockImplementation(
      () => [mockFormState, formActionMock, false] as const,
    );
  });

  it("keeps the typed draft after rerenders when the action state has not changed", () => {
    render(<ControlledComposerHarness />);

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

  it("rehydrates the textarea when the action returns a validation error", async () => {
    const { rerender } = render(<ControlledComposerHarness />);

    const textarea = screen.getByRole("textbox", {
      name: /escribe tu duda aqui/i,
    });

    fireEvent.change(textarea, {
      target: {
        value: "Borrador local",
      },
    });

    mockFormState = {
      error: "Escribe un mensaje para iniciar la conversacion.",
      message: "   ",
    };

    rerender(<ControlledComposerHarness />);

    await waitFor(() => {
      expect(textarea).toHaveValue("   ");
    });

    expect(
      screen.getByText("Escribe un mensaje para iniciar la conversacion."),
    ).toBeInTheDocument();
  });
});
