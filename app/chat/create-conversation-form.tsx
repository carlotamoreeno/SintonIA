"use client";

import { useState } from "react";
import { ChatComposerForm } from "./chat-composer-form";

type CreateConversationFormProps = {
  isPending: boolean;
  maxMessageChars: number;
  message: string;
  onMessageChange(message: string): void;
  onSubmitMessage(input: { message: string }): boolean;
};

function getCreateConversationValidationError(
  message: string,
  maxMessageChars: number,
) {
  const normalizedMessage = message.trim();

  if (normalizedMessage.length === 0) {
    return "Escribe un mensaje para iniciar la conversacion.";
  }

  if (normalizedMessage.length > maxMessageChars) {
    return `El mensaje no puede superar ${maxMessageChars} caracteres.`;
  }

  return null;
}

export function CreateConversationForm({
  isPending,
  maxMessageChars,
  message,
  onMessageChange,
  onSubmitMessage,
}: CreateConversationFormProps) {
  const [error, setError] = useState<string | null>(null);

  return (
    <ChatComposerForm
      error={error}
      formId="create-conversation-form"
      isPending={isPending}
      maxMessageChars={maxMessageChars}
      message={message}
      onMessageChange={(nextMessage) => {
        if (error !== null) {
          setError(null);
        }

        onMessageChange(nextMessage);
      }}
      onSubmit={(event) => {
        event.preventDefault();

        const validationError = getCreateConversationValidationError(
          message,
          maxMessageChars,
        );

        if (validationError) {
          setError(validationError);
          return;
        }

        const normalizedMessage = message.trim();
        const accepted = onSubmitMessage({
          message: normalizedMessage,
        });

        if (!accepted) {
          return;
        }

        setError(null);
        onMessageChange("");
      }}
      submitIdleLabel="Crear conversacion"
      submitPendingLabel="Guardando conversacion"
    />
  );
}
