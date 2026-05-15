"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { buildRelativeSignInUrl } from "@/lib/auth/access";
import { getOptionalAppSession } from "@/lib/auth/app-session";
import { chatRuntimeEnv } from "@/lib/chat/env";
import { activeKnowledgeDatasetResolver } from "@/lib/knowledge/active-dataset";
import { conversationStore } from "@/lib/supabase/conversation-store";
import type { CreateConversationFormState } from "./create-conversation-form-state";

const chatPagePath = "/chat";

const createConversationFormSchema = z.object({
  message: z
    .string()
    .trim()
    .min(1, "Escribe un mensaje para iniciar la conversacion.")
    .max(
      chatRuntimeEnv.maxMessageChars,
      `El mensaje no puede superar ${chatRuntimeEnv.maxMessageChars} caracteres.`,
    ),
});

function getFormMessage(formData: FormData) {
  const rawValue = formData.get("message");

  return typeof rawValue === "string" ? rawValue : "";
}

export async function createConversationAction(
  _previousState: CreateConversationFormState,
  formData: FormData,
): Promise<CreateConversationFormState> {
  const appSession = await getOptionalAppSession();

  if (!appSession?.session.user) {
    redirect(buildRelativeSignInUrl(chatPagePath));
  }

  const rawMessage = getFormMessage(formData);
  const parsedInput = createConversationFormSchema.safeParse({
    message: rawMessage,
  });

  if (!parsedInput.success) {
    return {
      error:
        parsedInput.error.flatten().fieldErrors.message?.[0] ??
        "No se pudo crear la conversacion.",
      message: rawMessage,
    };
  }

  let activeDataset;

  try {
    activeDataset = await activeKnowledgeDatasetResolver.resolveActiveDataset();
  } catch {
    return {
      error: "No se pudo resolver el dataset documental activo.",
      message: rawMessage,
    };
  }

  const result = await conversationStore.createConversationWithFirstUserMessage(
    {
      userId: appSession.persistedIdentity.user.id,
      content: parsedInput.data.message,
      datasetVersion: activeDataset.datasetVersion,
      vectorStoreId: activeDataset.vectorStoreId,
    },
  );

  revalidatePath(chatPagePath);
  redirect(
    `${chatPagePath}?conversation=${encodeURIComponent(result.conversationId)}`,
  );
}
