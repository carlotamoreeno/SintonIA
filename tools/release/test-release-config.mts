import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const { createOpenAIAdapter } = await import("../../lib/openai/adapter-core");
const { createOpenAIClient } = await import("../../lib/openai/client-core");
const { createSupabaseAdminClient } =
  await import("../../lib/supabase/client-core");
const { createKnowledgeVectorStoreRegistrationStore } =
  await import("../../lib/supabase/knowledge-vector-store-registry-core");

const EXPECTED_RELEASE_CONFIG = {
  activeDatasetVersion: "mvp-2026-03",
  appBaseUrl: "https://sinton-ia-taupe.vercel.app",
  chatEnablePromptCaching: "false",
  chatMaxHistoryTurns: 12,
  chatMaxMessageChars: 4000,
  chatMaxOutputTokens: 4096,
  chatRateLimitPerMinute: 20,
  openAIActiveVectorStoreId: "vs_69ca9b4e5e2081919bec55eb91742f70",
  openAIModel: "gpt-5.4-nano",
  openAITimeoutMs: 30000,
  openAIVectorStoreFileChunkingStrategy: "auto",
  supabaseUrl: "https://tkpsbxruivepsdzuddre.supabase.co",
} as const;

const REQUIRED_PRESENT_ENV = [
  "AUTH_SECRET",
  "AUTH_GOOGLE_ID",
  "AUTH_GOOGLE_SECRET",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "OPENAI_API_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
] as const;

type ReleaseEnv = Record<string, string | undefined>;

function parseEnvFile(filePath: string): ReleaseEnv {
  return Object.fromEntries(
    readFileSync(filePath, "utf8")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith("#"))
      .map((line) => {
        const normalizedLine = line.startsWith("export ")
          ? line.slice("export ".length).trim()
          : line;
        const separatorIndex = normalizedLine.indexOf("=");

        if (separatorIndex === -1) {
          return null;
        }

        const key = normalizedLine.slice(0, separatorIndex).trim();
        const rawValue = normalizedLine.slice(separatorIndex + 1).trim();
        const value =
          (rawValue.startsWith('"') && rawValue.endsWith('"')) ||
          (rawValue.startsWith("'") && rawValue.endsWith("'"))
            ? rawValue.slice(1, -1)
            : rawValue;

        return key.length > 0 ? ([key, value] as const) : null;
      })
      .filter((entry): entry is readonly [string, string] => entry !== null),
  );
}

function loadReleaseConfigEnv() {
  const explicitEnvFile = process.env.RELEASE_CONFIG_ENV_FILE?.trim();

  if (explicitEnvFile) {
    return {
      env: {
        ...process.env,
        ...parseEnvFile(explicitEnvFile),
      },
      source: explicitEnvFile,
    };
  }

  const envFromFiles: ReleaseEnv = {};

  for (const filePath of [".env", ".env.local", ".env.production"]) {
    if (existsSync(filePath)) {
      Object.assign(envFromFiles, parseEnvFile(filePath));
    }
  }

  return {
    env: {
      ...envFromFiles,
      ...process.env,
    },
    source: "process env + local env files",
  };
}

function getRequiredEnv(env: ReleaseEnv, name: string) {
  const value = env[name];

  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }

  throw new Error(`Missing required release config variable: ${name}`);
}

function getOptionalEnv(env: ReleaseEnv, name: string) {
  const value = env[name];

  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }

  return null;
}

function parseIntegerEnv(env: ReleaseEnv, name: string) {
  const value = Number(getRequiredEnv(env, name));

  if (!Number.isInteger(value)) {
    throw new Error(`${name} must be an integer.`);
  }

  return value;
}

function normalizeUrl(value: string) {
  return new URL(value).toString().replace(/\/+$/, "");
}

function assertNoStaticChunkingFields(env: ReleaseEnv) {
  for (const name of [
    "OPENAI_VECTOR_STORE_FILE_MAX_CHUNK_SIZE_TOKENS",
    "OPENAI_VECTOR_STORE_FILE_CHUNK_OVERLAP_TOKENS",
  ]) {
    assert.equal(
      getOptionalEnv(env, name),
      null,
      `${name} must not be set while the release chunking strategy is auto.`,
    );
  }
}

async function main() {
  const { env, source } = loadReleaseConfigEnv();
  const presentEnv = Object.fromEntries(
    REQUIRED_PRESENT_ENV.map((name) => [
      name,
      getRequiredEnv(env, name).length > 0,
    ]),
  );

  const appBaseUrl = normalizeUrl(getRequiredEnv(env, "APP_BASE_URL"));
  const activeDatasetVersion = getRequiredEnv(env, "ACTIVE_DATASET_VERSION");
  const openAIModel = getRequiredEnv(env, "OPENAI_MODEL");
  const openAIActiveVectorStoreId = getRequiredEnv(
    env,
    "OPENAI_ACTIVE_VECTOR_STORE_ID",
  );
  const openAITimeoutMs = parseIntegerEnv(env, "OPENAI_TIMEOUT_MS");
  const openAIVectorStoreFileChunkingStrategy =
    getOptionalEnv(env, "OPENAI_VECTOR_STORE_FILE_CHUNKING_STRATEGY") ?? "auto";
  const chatEnablePromptCaching = getRequiredEnv(
    env,
    "CHAT_ENABLE_PROMPT_CACHING",
  ).toLowerCase();
  const chatMaxMessageChars = parseIntegerEnv(env, "CHAT_MAX_MESSAGE_CHARS");
  const chatMaxHistoryTurns = parseIntegerEnv(env, "CHAT_MAX_HISTORY_TURNS");
  const chatMaxOutputTokens = parseIntegerEnv(env, "CHAT_MAX_OUTPUT_TOKENS");
  const chatRateLimitPerMinute = parseIntegerEnv(
    env,
    "CHAT_RATE_LIMIT_PER_MIN",
  );
  const supabaseUrl = normalizeUrl(
    getRequiredEnv(env, "NEXT_PUBLIC_SUPABASE_URL"),
  );

  assert.equal(appBaseUrl, EXPECTED_RELEASE_CONFIG.appBaseUrl);
  assert.equal(
    activeDatasetVersion,
    EXPECTED_RELEASE_CONFIG.activeDatasetVersion,
  );
  assert.equal(openAIModel, EXPECTED_RELEASE_CONFIG.openAIModel);
  assert.equal(
    openAIActiveVectorStoreId,
    EXPECTED_RELEASE_CONFIG.openAIActiveVectorStoreId,
  );
  assert.equal(openAITimeoutMs, EXPECTED_RELEASE_CONFIG.openAITimeoutMs);
  assert.equal(
    openAIVectorStoreFileChunkingStrategy,
    EXPECTED_RELEASE_CONFIG.openAIVectorStoreFileChunkingStrategy,
  );
  assertNoStaticChunkingFields(env);
  assert.equal(
    chatEnablePromptCaching,
    EXPECTED_RELEASE_CONFIG.chatEnablePromptCaching,
  );
  assert.equal(
    chatMaxMessageChars,
    EXPECTED_RELEASE_CONFIG.chatMaxMessageChars,
  );
  assert.equal(
    chatMaxHistoryTurns,
    EXPECTED_RELEASE_CONFIG.chatMaxHistoryTurns,
  );
  assert.equal(
    chatMaxOutputTokens,
    EXPECTED_RELEASE_CONFIG.chatMaxOutputTokens,
  );
  assert.equal(
    chatRateLimitPerMinute,
    EXPECTED_RELEASE_CONFIG.chatRateLimitPerMinute,
  );
  assert.equal(supabaseUrl, EXPECTED_RELEASE_CONFIG.supabaseUrl);

  const supabase = createSupabaseAdminClient({
    serviceRoleKey: getRequiredEnv(env, "SUPABASE_SERVICE_ROLE_KEY"),
    supabaseUrl,
  });
  const registryStore = createKnowledgeVectorStoreRegistrationStore(supabase);
  const activeRegistration = await registryStore.findActiveRegistration();

  assert.ok(activeRegistration, "Expected one active dataset registry row.");
  assert.equal(
    activeRegistration.datasetVersion,
    EXPECTED_RELEASE_CONFIG.activeDatasetVersion,
  );
  assert.equal(
    activeRegistration.vectorStoreId,
    EXPECTED_RELEASE_CONFIG.openAIActiveVectorStoreId,
  );
  assert.equal(activeRegistration.isActive, true);

  const openAI = createOpenAIAdapter(
    createOpenAIClient({
      apiKey: getRequiredEnv(env, "OPENAI_API_KEY"),
      timeoutMs: openAITimeoutMs,
    }),
  );
  const vectorStore = await openAI.retrieveVectorStore(
    openAIActiveVectorStoreId,
  );

  assert.equal(vectorStore.status, "completed");
  assert.ok(
    vectorStore.file_counts.completed > 0,
    "Expected the active vector store to have completed files.",
  );

  console.log(
    JSON.stringify(
      {
        ok: true,
        source,
        frozenConfig: {
          activeDatasetVersion,
          appBaseUrl,
          chatEnablePromptCaching,
          chatMaxHistoryTurns,
          chatMaxMessageChars,
          chatMaxOutputTokens,
          chatRateLimitPerMinute,
          openAIActiveVectorStoreId,
          openAIModel,
          openAITimeoutMs,
          openAIVectorStoreFileChunkingStrategy,
          supabaseUrl,
        },
        openAI: {
          vectorStoreFileCounts: vectorStore.file_counts,
          vectorStoreStatus: vectorStore.status,
        },
        requiredEnvPresent: presentEnv,
        supabase: {
          activeRegistrySource: "knowledge_vector_store_registry",
          activeRegistryUpdatedAt: activeRegistration.updatedAt,
          activeRegistryActivatedAt: activeRegistration.activatedAt,
        },
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(
    error instanceof Error ? (error.stack ?? error.message) : String(error),
  );
  process.exitCode = 1;
});
