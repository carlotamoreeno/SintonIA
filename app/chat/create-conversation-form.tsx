"use client";

import { useActionState, useEffect } from "react";
import { LoaderCircle, Mic, Plus, SendHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { createConversationAction } from "./actions";
import { initialCreateConversationFormState } from "./create-conversation-form-state";
import { Textarea } from "@/components/ui/textarea";

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

  useEffect(() => {
    if (state.message !== message) {
      onMessageChange(state.message);
    }
  }, [message, onMessageChange, state.message]);

  return (
    <form
      action={formAction}
      className="space-y-3"
      id="create-conversation-form"
    >
      <div className="relative">
        <div className="absolute inset-0 rounded-2xl bg-[rgba(39,79,61,0.05)] blur-[8px]" />

        <div className="relative flex items-end gap-3 rounded-2xl border border-[rgba(191,201,193,0.2)] bg-white p-[13px] shadow-[0_20px_25px_-5px_rgba(39,79,61,0.05),0_8px_10px_-6px_rgba(39,79,61,0.05)]">
          <button
            aria-label="Adjuntar referencia (proximamente)"
            className="botanical-focus inline-flex size-10 items-center justify-center rounded-xl text-[#a2aaa4] transition hover:bg-[#f6f4ec]"
            disabled
            type="button"
          >
            <Plus className="size-5" />
          </button>

          <div className="flex-1">
            <label className="sr-only" htmlFor="message">
              Escribe tu duda aqui
            </label>
            <Textarea
              aria-describedby="composer-note composer-limit"
              className="max-h-48 min-h-10 resize-none border-0 bg-transparent px-3 py-2 text-base leading-6 text-[#1b1c17] shadow-none placeholder:text-[rgba(112,121,115,0.6)] focus-visible:ring-0"
              disabled={isPending}
              id="message"
              maxLength={maxMessageChars}
              name="message"
              onChange={(event) => onMessageChange(event.target.value)}
              placeholder="Escribe tu duda aqui..."
              required
              rows={1}
              value={message}
            />
          </div>

          <div className="flex items-start gap-2">
            <button
              aria-label="Dictado por voz (proximamente)"
              className="botanical-focus inline-flex size-10 items-center justify-center rounded-xl text-[#a2aaa4] transition hover:bg-[#f6f4ec]"
              disabled
              type="button"
            >
              <Mic className="size-4" />
            </button>

            <button
              aria-label={
                isPending ? "Guardando conversacion" : "Crear conversacion"
              }
              className={cn(
                "botanical-focus inline-flex size-10 items-center justify-center rounded-xl bg-[#274f3d] text-white shadow-[0_10px_15px_-3px_rgba(39,79,61,0.2),0_4px_6px_-4px_rgba(39,79,61,0.2)] transition hover:bg-[#1f4031]",
                isPending && "cursor-wait",
              )}
              disabled={isPending}
              type="submit"
            >
              {isPending ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : (
                <SendHorizontal className="size-4" />
              )}
            </button>
          </div>
        </div>
      </div>

      {state.error ? (
        <p className="rounded-2xl border border-[#e2b4b4] bg-[#fff2f2] px-4 py-3 text-sm leading-6 text-[#a14646]">
          {state.error}
        </p>
      ) : null}

      <div className="flex flex-col items-center gap-1 text-center">
        <p
          className="text-[0.625rem] leading-[0.9375rem] text-[rgba(112,121,115,0.7)]"
          id="composer-note"
        >
          SintonIA puede cometer errores. Considera verificar la informacion
          importante.
        </p>
        <p
          className="text-[0.625rem] leading-[0.9375rem] text-[rgba(112,121,115,0.55)]"
          id="composer-limit"
        >
          Maximo actual: {maxMessageChars} caracteres.
        </p>
      </div>
    </form>
  );
}
