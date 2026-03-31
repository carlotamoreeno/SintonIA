process.loadEnvFile?.();

const { createReindexKnowledgeDocument } =
  await import("../../lib/knowledge/reindex-knowledge-document-core");
const { createReindexKnowledgeDataset } =
  await import("../../lib/knowledge/reindex-knowledge-dataset-core");
const { createAttachKnowledgeDocumentToVectorStore } =
  await import("../../lib/knowledge/attach-document-to-vector-store-core");
const { createOpenAIAdapter } = await import("../../lib/openai/adapter-core");
const { createOpenAIClient } = await import("../../lib/openai/client-core");
const { parseOpenAIServerEnv } = await import("../../lib/openai/env-core");
const { createSupabaseAdminClient } =
  await import("../../lib/supabase/client-core");
const { createKnowledgeDocumentCatalogStore } =
  await import("../../lib/supabase/knowledge-document-store-core");
const { createKnowledgeVectorStoreRegistrationStore } =
  await import("../../lib/supabase/knowledge-vector-store-registry-core");
const { formatErrorPayload, parseCliArgs } =
  await import("./vector-store-reindex-dataset-cli");

async function main() {
  const input = parseCliArgs(process.argv.slice(2));
  const openAIEnv = parseOpenAIServerEnv(process.env);
  const supabase = createSupabaseAdminClient({
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  });
  const openAI = createOpenAIAdapter(
    createOpenAIClient({
      apiKey: openAIEnv.apiKey,
      timeoutMs: openAIEnv.timeoutMs,
    }),
  );
  const catalogStore = createKnowledgeDocumentCatalogStore(supabase);
  const registryStore = createKnowledgeVectorStoreRegistrationStore(supabase);
  const attachKnowledgeDocumentToVectorStore =
    createAttachKnowledgeDocumentToVectorStore({
      catalogStore,
      openAI,
      registryStore,
      vectorStoreFileChunkingStrategy:
        openAIEnv.vectorStoreFileChunkingStrategy,
    });
  const reindexKnowledgeDocument = createReindexKnowledgeDocument({
    attachKnowledgeDocumentToVectorStore,
    catalogStore,
    openAI,
    registryStore,
  });
  const reindexKnowledgeDataset = createReindexKnowledgeDataset({
    catalogStore,
    registryStore,
    reindexKnowledgeDocument,
  });
  const result = await reindexKnowledgeDataset(input);

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
