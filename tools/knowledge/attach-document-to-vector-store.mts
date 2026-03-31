process.loadEnvFile?.();

const { createOpenAIAdapter } = await import("../../lib/openai/adapter-core");
const { createOpenAIClient } = await import("../../lib/openai/client-core");
const { createAttachKnowledgeDocumentToVectorStore } =
  await import("../../lib/knowledge/attach-document-to-vector-store-core");
const { createSupabaseAdminClient } =
  await import("../../lib/supabase/client-core");
const { createKnowledgeDocumentCatalogStore } =
  await import("../../lib/supabase/knowledge-document-store-core");
const { createKnowledgeVectorStoreRegistrationStore } =
  await import("../../lib/supabase/knowledge-vector-store-registry-core");
const { formatErrorPayload, parseCliArgs } =
  await import("./vector-store-attach-cli");

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
  const attachKnowledgeDocumentToVectorStore =
    createAttachKnowledgeDocumentToVectorStore({
      catalogStore: createKnowledgeDocumentCatalogStore(supabase),
      openAI,
      registryStore: createKnowledgeVectorStoreRegistrationStore(supabase),
    });
  const result = await attachKnowledgeDocumentToVectorStore(input);

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
