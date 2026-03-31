"use client";

import { useActionState, useEffect, useRef } from "react";
import { createConversationAction } from "./actions";
import { ChatComposerForm } from "./chat-composer-form";
import { initialCreateConversationFormState } from "./create-conversation-form-state";

type CreateConversationFormProps = {
  maxMessageChars: number;
  message: string;
  onMessageChange(message: string): void;
};

export function CreateConversationForm({
  maxMessageChars,
  message,
  onMessageChange,
}: CreateConversationFormProps) {
  const [state, formAction, isPending] = useActionState(
    createConversationAction,
    initialCreateConversationFormState,
  );
  const previousActionStateRef = useRef(state);

  useEffect(() => {
    if (previousActionStateRef.current === state) {
      return;
    }

    previousActionStateRef.current = state;

    if (state.message !== message) {
      onMessageChange(state.message);
    }
  }, [message, onMessageChange, state]);

  return (
    <ChatComposerForm
      action={formAction}
      error={state.error}
      formId="create-conversation-form"
      isPending={isPending}
      maxMessageChars={maxMessageChars}
      message={message}
      onMessageChange={onMessageChange}
      submitIdleLabel="Crear conversacion"
      submitPendingLabel="Guardando conversacion"
    />
  );
}
