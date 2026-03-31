import { z } from "zod";
import { AttachKnowledgeDocumentToVectorStoreError } from "@/lib/knowledge/attach-document-to-vector-store-core";

export const vectorStoreAttachCliArgsSchema = z.object({
  datasetVersion: z.string().trim().min(1),
  docId: z.string().trim().min(1),
  documentVersion: z.coerce.number().int().positive(),
});

export type VectorStoreAttachCliArgs = z.infer<
  typeof vectorStoreAttachCliArgsSchema
>;

export function buildUsageMessage() {
  return [
    "Usage:",
    "npm run knowledge:vector-store:attach -- --dataset-version <value> --doc-id <value> --document-version <positive-integer>",
  ].join("\n");
}

export function parseCliArgs(argv: string[]): VectorStoreAttachCliArgs {
  const args = new Map<string, string>();

  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];

    if (!key?.startsWith("--")) {
      throw new Error(
        `Unexpected argument: ${key ?? "<missing>"}.\n${buildUsageMessage()}`,
      );
    }

    if (typeof value !== "string" || value.startsWith("--")) {
      throw new Error(`Missing value for ${key}.\n${buildUsageMessage()}`);
    }

    args.set(key, value);
  }

  return vectorStoreAttachCliArgsSchema.parse({
    datasetVersion: args.get("--dataset-version"),
    docId: args.get("--doc-id"),
    documentVersion: args.get("--document-version"),
  });
}

export function formatErrorPayload(error: unknown) {
  if (error instanceof AttachKnowledgeDocumentToVectorStoreError) {
    return {
      code: error.code,
      message: error.message,
      ok: false,
      openAIFileId: error.openAIFileId ?? null,
      vectorStoreFileId: error.vectorStoreFileId ?? null,
      vectorStoreId: error.vectorStoreId ?? null,
    };
  }

  if (error instanceof z.ZodError) {
    return {
      code: "invalid_cli_arguments",
      issues: error.flatten(),
      message: "Invalid CLI arguments.",
      ok: false,
      openAIFileId: null,
      vectorStoreFileId: null,
      vectorStoreId: null,
    };
  }

  return {
    code: "unexpected_error",
    message:
      error instanceof Error && error.message.trim().length > 0
        ? error.message
        : String(error),
    ok: false,
    openAIFileId: null,
    vectorStoreFileId: null,
    vectorStoreId: null,
  };
}
