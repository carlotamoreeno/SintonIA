"use client";

import { useState } from "react";
import { ChatComposerForm } from "./chat-composer-form";

type ContinueConversationFormProps = {
  conversationId?: string;
  isPending: boolean;
  maxMessageChars: number;
  message: string;
  onMessageChange(message: string): void;
  onSubmitMessage(input: { conversationId?: string; message: string }): boolean;
};

function getContinueConversationValidationError(
  message: string,
  maxMessageChars: number,
) {
  const normalizedMessage = message.trim();

  if (normalizedMessage.length === 0) {
    return "Escribe un mensaje para continuar la conversacion.";
  }

  if (normalizedMessage.length > maxMessageChars) {
    return `El mensaje no puede superar ${maxMessageChars} caracteres.`;
  }

  return null;
}

export function ContinueConversationForm({
  conversationId,
  isPending,
  maxMessageChars,
  message,
  onMessageChange,
  onSubmitMessage,
}: ContinueConversationFormProps) {
  const [error, setError] = useState<string | null>(null);

  return (
    <ChatComposerForm
      error={error}
      formId="continue-conversation-form"
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

        const validationError = getContinueConversationValidationError(
          message,
          maxMessageChars,
        );

        if (validationError) {
          setError(validationError);
          return;
        }

        const normalizedMessage = message.trim();
        const accepted = onSubmitMessage({
          conversationId,
          message: normalizedMessage,
        });

        if (!accepted) {
          return;
        }

        setError(null);
        onMessageChange("");
      }}
      submitIdleLabel="Enviar mensaje"
      submitPendingLabel="Enviando mensaje"
    />
  );
}
