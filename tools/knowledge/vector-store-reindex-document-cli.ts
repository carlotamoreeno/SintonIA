import { z } from "zod";
import { ReindexKnowledgeDocumentError } from "@/lib/knowledge/reindex-knowledge-document-core";

export const vectorStoreReindexDocumentCliArgsSchema = z.object({
  datasetVersion: z.string().trim().min(1),
  docId: z.string().trim().min(1),
  documentVersion: z.coerce.number().int().positive(),
});

export type VectorStoreReindexDocumentCliArgs = z.infer<
  typeof vectorStoreReindexDocumentCliArgsSchema
>;

export function buildUsageMessage() {
  return [
    "Usage:",
    "npm run knowledge:vector-store:reindex:document -- --dataset-version <value> --doc-id <value> --document-version <positive-integer>",
  ].join("\n");
}

export function parseCliArgs(
  argv: string[],
): VectorStoreReindexDocumentCliArgs {
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

  return vectorStoreReindexDocumentCliArgsSchema.parse({
    datasetVersion: args.get("--dataset-version"),
    docId: args.get("--doc-id"),
    documentVersion: args.get("--document-version"),
  });
}

export function formatErrorPayload(error: unknown) {
  if (error instanceof ReindexKnowledgeDocumentError) {
    return {
      code: error.code,
      message: error.message,
      ok: false,
      openAIFileId: error.openAIFileId ?? null,
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
    vectorStoreId: null,
  };
}
