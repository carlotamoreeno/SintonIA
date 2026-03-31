import { z } from "zod";
import { CreateOrRegisterVectorStoreForDatasetError } from "@/lib/knowledge/create-vector-store-for-dataset-core";

export const vectorStoreCreateCliArgsSchema = z.object({
  datasetVersion: z.string().trim().min(1),
  existingVectorStoreId: z.string().trim().min(1).optional(),
  name: z.string().trim().min(1).optional(),
});

export type VectorStoreCreateCliArgs = z.infer<
  typeof vectorStoreCreateCliArgsSchema
>;

export function buildUsageMessage() {
  return [
    "Usage:",
    "npm run knowledge:vector-store:create -- --dataset-version <value> [--existing-vector-store-id <id>] [--name <value>]",
  ].join("\n");
}

export function parseCliArgs(argv: string[]): VectorStoreCreateCliArgs {
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

  return vectorStoreCreateCliArgsSchema.parse({
    datasetVersion: args.get("--dataset-version"),
    existingVectorStoreId: args.get("--existing-vector-store-id"),
    name: args.get("--name"),
  });
}

export function formatErrorPayload(error: unknown) {
  if (error instanceof CreateOrRegisterVectorStoreForDatasetError) {
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
