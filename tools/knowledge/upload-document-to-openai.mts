process.loadEnvFile?.();

const { z } = await import("zod");
const { createOpenAIAdapter } = await import("../../lib/openai/adapter-core");
const { createOpenAIClient } = await import("../../lib/openai/client-core");
const {
  UploadKnowledgeDocumentToOpenAIError,
  createUploadKnowledgeDocumentToOpenAI,
} = await import("../../lib/knowledge/openai-file-upload-core");
const { createSupabaseAdminClient } =
  await import("../../lib/supabase/client-core");
const { createKnowledgeDocumentCatalogStore } =
  await import("../../lib/supabase/knowledge-document-store-core");

const cliArgsSchema = z.object({
  datasetVersion: z.string().trim().min(1),
  docId: z.string().trim().min(1),
  documentVersion: z.coerce.number().int().positive(),
});

function buildUsageMessage() {
  return [
    "Usage:",
    "npm run knowledge:openai:upload -- --dataset-version <value> --doc-id <value> --document-version <positive-integer>",
  ].join("\n");
}

function parseCliArgs(argv: string[]) {
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

  return cliArgsSchema.parse({
    datasetVersion: args.get("--dataset-version"),
    docId: args.get("--doc-id"),
    documentVersion: args.get("--document-version"),
  });
}

function formatErrorPayload(error: unknown) {
  if (error instanceof UploadKnowledgeDocumentToOpenAIError) {
    return {
      code: error.code,
      message: error.message,
      ok: false,
      openAIFileId: error.openAIFileId ?? null,
    };
  }

  if (error instanceof z.ZodError) {
    return {
      code: "invalid_cli_arguments",
      issues: error.flatten(),
      message: "Invalid CLI arguments.",
      ok: false,
      openAIFileId: null,
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
  };
}

async function main() {
  const input = parseCliArgs(process.argv.slice(2));
  const supabase = createSupabaseAdminClient({
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  });
  const openAI = createOpenAIAdapter(
    createOpenAIClient({
      apiKey: process.env.OPENAI_API_KEY ?? "",
      timeoutMs: Number(process.env.OPENAI_TIMEOUT_MS ?? "30000"),
    }),
  );
  const uploadKnowledgeDocumentToOpenAI = createUploadKnowledgeDocumentToOpenAI(
    {
      catalogStore: createKnowledgeDocumentCatalogStore(supabase),
      openAI,
      supabase,
    },
  );
  const result = await uploadKnowledgeDocumentToOpenAI(input);

  console.log(
    JSON.stringify(
      {
        ok: true,
        ...result,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(JSON.stringify(formatErrorPayload(error), null, 2));
  process.exitCode = 1;
});
