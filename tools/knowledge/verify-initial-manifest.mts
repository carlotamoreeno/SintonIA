process.loadEnvFile?.();

const { createOpenAIAdapter } = await import("../../lib/openai/adapter-core");
const { createOpenAIClient } = await import("../../lib/openai/client-core");
const { createKnowledgeDocumentCatalogStore } =
  await import("../../lib/supabase/knowledge-document-store-core");
const { createSupabaseAdminClient } =
  await import("../../lib/supabase/client-core");
const {
  formatInitialCatalogManifestVerification,
  loadInitialCatalogManifest,
  verifyInitialCatalogManifest,
} = await import("../../lib/knowledge/initial-manifest");

function requireEnv(name: string) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

async function main() {
  const supabase = createSupabaseAdminClient({
    serviceRoleKey: requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    supabaseUrl: requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
  });
  const openAI = createOpenAIAdapter(
    createOpenAIClient({
      apiKey: requireEnv("OPENAI_API_KEY"),
      timeoutMs: Number(process.env.OPENAI_TIMEOUT_MS ?? "30000"),
    }),
  );
  const verification = await verifyInitialCatalogManifest(
    {
      catalogStore: createKnowledgeDocumentCatalogStore(supabase),
      openAI,
      supabase,
    },
    loadInitialCatalogManifest(),
  );
  console.log(formatInitialCatalogManifestVerification(verification));

  if (!verification.ok) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  const message =
    error instanceof Error && error.message.trim().length > 0
      ? (error.stack ?? error.message)
      : String(error);

  console.error(message);
  process.exitCode = 1;
});
