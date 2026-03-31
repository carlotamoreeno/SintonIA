import { z } from "zod";
import {
  MAX_MANUAL_DATASET_REINDEX_DOCUMENTS,
  ReindexKnowledgeDatasetError,
} from "@/lib/knowledge/reindex-knowledge-dataset-core";

export const vectorStoreReindexDatasetCliArgsSchema = z.object({
  datasetVersion: z.string().trim().min(1),
  limit: z.coerce
    .number()
    .int()
    .positive()
    .max(MAX_MANUAL_DATASET_REINDEX_DOCUMENTS)
    .default(MAX_MANUAL_DATASET_REINDEX_DOCUMENTS),
});

export type VectorStoreReindexDatasetCliArgs = z.infer<
  typeof vectorStoreReindexDatasetCliArgsSchema
>;

export function buildUsageMessage() {
  return [
    "Usage:",
    `npm run knowledge:vector-store:reindex:dataset -- --dataset-version <value> [--limit <1-${MAX_MANUAL_DATASET_REINDEX_DOCUMENTS}>]`,
  ].join("\n");
}

export function parseCliArgs(argv: string[]): VectorStoreReindexDatasetCliArgs {
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

  return vectorStoreReindexDatasetCliArgsSchema.parse({
    datasetVersion: args.get("--dataset-version"),
    limit: args.get("--limit"),
  });
}

export function formatErrorPayload(error: unknown) {
  if (error instanceof ReindexKnowledgeDatasetError) {
    return {
      code: error.code,
      message: error.message,
      ok: false,
      vectorStoreId: error.vectorStoreId ?? null,
    };
  }

  if (error instanceof z.ZodError) {
    return {
      code: "invalid_cli_arguments",
      issues: error.flatten(),
      message: "Invalid CLI arguments.",
      ok: false,
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
    vectorStoreId: null,
  };
}
