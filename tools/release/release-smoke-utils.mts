import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import process from "node:process";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { encode } from "next-auth/jwt";
import * as adapterCoreModule from "../../lib/openai/adapter-core.js";
import * as clientCoreModule from "../../lib/openai/client-core.js";
import type { OpenAIAdapter } from "../../lib/openai/adapter-core.js";

type AdapterCoreModule = typeof import("../../lib/openai/adapter-core.js");
type ClientCoreModule = typeof import("../../lib/openai/client-core.js");

const adapterCore = adapterCoreModule as AdapterCoreModule & {
  default?: AdapterCoreModule;
};
const clientCore = clientCoreModule as ClientCoreModule & {
  default?: ClientCoreModule;
};
const createOpenAIAdapter =
  adapterCore.createOpenAIAdapter ?? adapterCore.default?.createOpenAIAdapter;
const { createOpenAIClient: createOpenAIClientCore } =
  clientCore.createOpenAIClient !== undefined
    ? clientCore
    : clientCore.default!;

if (createOpenAIAdapter === undefined) {
  throw new Error("Failed to load OpenAI adapter for release smoke.");
}

export const REQUEST_TIMEOUT_MS = 120_000;

export type JsonResponse<T = unknown> = {
  headers: Headers;
  json: T | null;
  status: number;
  text: string;
};

export type ChatCitation = {
  documentId: string;
  documentName: string;
  fileId: string;
  snippet: string;
  vectorStoreId: string;
};

export type ChatSuccessPayload = {
  citations: ChatCitation[];
  conversationId: string;
  grounded: boolean;
  messageId: string;
  text: string;
};

export type InvalidPayloadResponse = {
  issues: {
    conversationId?: string[];
    message?: string[];
  };
  message: string;
};

export type MeResponse = {
  email: string | null;
  id: string;
  role: "user" | "expert" | "admin";
};

export type ActiveDatasetSmokeState = {
  datasetVersion: string;
  source: "active_registry" | "env_fallback";
  vectorStoreId: string;
};

export type SmokeIdentity = {
  authSubject: string;
  cookieHeader: string;
  cookieName: string;
  email: string;
  publicUserId: string;
};

type SupabaseAdminClient = SupabaseClient;

export function loadReleaseEnvFiles() {
  for (const fileName of [".env", ".env.local", ".env.production"]) {
    if (existsSync(fileName)) {
      process.loadEnvFile?.(fileName);
    }
  }
}

export function getRequiredEnv(name: string) {
  const value = process.env[name];

  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }

  throw new Error(`Missing required environment variable: ${name}`);
}

export function getOptionalEnv(name: string) {
  const value = process.env[name];

  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }

  return null;
}

export function getReleaseBaseUrl() {
  const rawBaseUrl = getRequiredEnv("RELEASE_SMOKE_BASE_URL");
  const parsed = new URL(rawBaseUrl);

  return parsed.toString().replace(/\/+$/, "");
}

export function getAuthSessionCookieName(baseUrl: string) {
  return new URL(baseUrl).protocol === "https:"
    ? "__Secure-authjs.session-token"
    : "authjs.session-token";
}

export function createSupabaseAdminClient() {
  return createClient(
    getRequiredEnv("NEXT_PUBLIC_SUPABASE_URL"),
    getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
    {
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: false,
      },
    },
  );
}

export function createOpenAIClient() {
  return createOpenAIAdapter(
    createOpenAIClientCore({
      apiKey: getRequiredEnv("OPENAI_API_KEY"),
      timeoutMs: Number(process.env.OPENAI_TIMEOUT_MS ?? "30000"),
    }),
  );
}

export async function createSyntheticIdentity(input: {
  baseUrl: string;
  name: string;
  role?: "user" | "expert" | "admin";
}) {
  const authSubject = `${input.name}-${Date.now()}-${randomUUID().slice(0, 8)}`;
  const email = `${authSubject}@example.com`;
  const cookieName = getAuthSessionCookieName(input.baseUrl);
  const token = await encode({
    salt: cookieName,
    secret: getRequiredEnv("AUTH_SECRET"),
    token: {
      appUserId: `google:${authSubject}`,
      authSubject,
      email,
      emailVerified: true,
      name: input.name,
      picture: null,
      provider: "google",
      role: input.role ?? "user",
      sub: authSubject,
    },
  });

  return {
    authSubject,
    cookieHeader: `${cookieName}=${token}`,
    cookieName,
    email,
    publicUserId: `google:${authSubject}`,
  } satisfies SmokeIdentity;
}

export async function requestJson<T = unknown>(
  url: string,
  init?: RequestInit,
): Promise<JsonResponse<T>> {
  const response = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const text = await response.text();

  return {
    headers: response.headers,
    json: text.trim().length > 0 ? (JSON.parse(text) as T) : null,
    status: response.status,
    text,
  };
}

export async function requestChatJsonWithRetry<T = unknown>(
  url: string,
  init?: RequestInit,
  retries = 1,
): Promise<JsonResponse<T>> {
  let response = await requestJson<T>(url, init);

  for (let attempt = 0; attempt < retries; attempt += 1) {
    if (response.status !== 502 && response.status !== 504) {
      return response;
    }

    await new Promise((resolve) => setTimeout(resolve, 1_000));
    response = await requestJson<T>(url, init);
  }

  return response;
}

export async function requestText(url: string, init?: RequestInit) {
  const response = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const text = await response.text();

  return {
    headers: response.headers,
    status: response.status,
    text,
  };
}

export function assertRequestIdHeader(headers: Headers, label: string): string {
  const requestId = headers.get("x-request-id");

  assert.match(
    requestId ?? "",
    /^[A-Za-z0-9][A-Za-z0-9_-]{7,127}$/,
    `Expected ${label} response to include a valid x-request-id header.`,
  );

  return requestId ?? "";
}

export function assertNoStore(headers: Headers, label: string) {
  assert.match(
    headers.get("cache-control") ?? "",
    /no-store/i,
    `Expected ${label} to set cache-control: no-store.`,
  );
}

export function assertChatPayloadContract(
  payload: ChatSuccessPayload | null,
  expectedVectorStoreId: string,
  options: {
    requireGrounded?: boolean;
  } = {},
) {
  assert.ok(payload, "Expected chat response JSON.");
  assert.equal(typeof payload?.text, "string");
  assert.ok(
    (payload?.text ?? "").trim().length > 0,
    "Expected chat response text to be non-empty.",
  );
  assert.equal(
    /filecite|||/u.test(payload?.text ?? ""),
    false,
    "Expected chat response text to hide provider citation artifacts.",
  );
  assert.match(payload?.messageId ?? "", /^resp_/);
  assert.equal(Array.isArray(payload?.citations), true);
  assert.equal(typeof payload?.grounded, "boolean");

  if (options.requireGrounded) {
    assert.equal(payload?.grounded, true);
  }

  if (!payload?.grounded) {
    assert.deepEqual(payload?.citations, []);
    return;
  }

  assert.ok(
    payload.citations.length > 0,
    "Expected grounded responses to expose at least one citation.",
  );

  for (const citation of payload.citations) {
    assert.equal(typeof citation.documentId, "string");
    assert.ok(citation.documentId.trim().length > 0);
    assert.equal(typeof citation.documentName, "string");
    assert.ok(citation.documentName.trim().length > 0);
    assert.equal(typeof citation.fileId, "string");
    assert.ok(citation.fileId.trim().length > 0);
    assert.equal(typeof citation.snippet, "string");
    assert.ok(citation.snippet.trim().length > 0);
    assert.equal(citation.vectorStoreId, expectedVectorStoreId);
  }
}

export function toNormalizedVisibleText(text: string) {
  return text
    .replace(/<[^>]+>/g, " ")
    .replace(/\*\*|__/g, "")
    .replace(/\r\n?/g, "\n")
    .replace(/\s+/g, " ")
    .trim();
}

export async function resolveExpectedActiveDatasetForSmoke(
  supabase: SupabaseAdminClient,
): Promise<ActiveDatasetSmokeState> {
  const { data: activeRow, error: activeError } = await supabase
    .from("knowledge_vector_store_registry")
    .select("dataset_version, vector_store_id")
    .eq("is_active", true)
    .limit(1)
    .maybeSingle<{
      dataset_version: string;
      vector_store_id: string;
    }>();

  if (activeError) {
    throw new Error(
      `Failed to load active vector store registry row: ${activeError.message}`,
    );
  }

  if (activeRow) {
    return {
      datasetVersion: activeRow.dataset_version,
      source: "active_registry",
      vectorStoreId: activeRow.vector_store_id,
    };
  }

  const fallbackDatasetVersion = getOptionalEnv("ACTIVE_DATASET_VERSION");

  if (!fallbackDatasetVersion) {
    throw new Error(
      "Missing active dataset registry row and ACTIVE_DATASET_VERSION fallback.",
    );
  }

  const { data: fallbackRow, error: fallbackError } = await supabase
    .from("knowledge_vector_store_registry")
    .select("dataset_version, vector_store_id")
    .eq("dataset_version", fallbackDatasetVersion)
    .maybeSingle<{
      dataset_version: string;
      vector_store_id: string;
    }>();

  if (fallbackError) {
    throw new Error(
      `Failed to load fallback vector store registry row: ${fallbackError.message}`,
    );
  }

  if (!fallbackRow) {
    throw new Error(
      `ACTIVE_DATASET_VERSION=${fallbackDatasetVersion} is not registered.`,
    );
  }

  return {
    datasetVersion: fallbackRow.dataset_version,
    source: "env_fallback",
    vectorStoreId: fallbackRow.vector_store_id,
  };
}

export async function loadPersistedUserId(
  supabase: SupabaseAdminClient,
  authSubject: string,
) {
  const { data, error } = await supabase
    .from("users")
    .select("id")
    .eq("auth_provider", "google")
    .eq("auth_subject", authSubject)
    .maybeSingle<{ id: string }>();

  if (error) {
    throw new Error(`Failed to load smoke user: ${error.message}`);
  }

  assert.ok(data?.id, "Expected smoke user to be persisted in users.");

  return data.id;
}

export async function seedRoleCode(
  supabase: SupabaseAdminClient,
  userId: string,
  roleCode: "user" | "expert" | "admin",
) {
  const { data: role, error: roleError } = await supabase
    .from("roles")
    .select("id")
    .eq("code", roleCode)
    .single<{ id: string }>();

  if (roleError || !role) {
    throw new Error(
      `Failed to resolve ${roleCode} role: ${roleError?.message}`,
    );
  }

  const { error } = await supabase.from("user_roles").upsert(
    {
      granted_at: new Date().toISOString(),
      role_id: role.id,
      user_id: userId,
    },
    {
      ignoreDuplicates: true,
      onConflict: "user_id,role_id",
    },
  );

  if (error) {
    throw new Error(`Failed to seed ${roleCode} role: ${error.message}`);
  }
}

export async function cleanupUserData(
  supabase: SupabaseAdminClient,
  authSubject: string,
) {
  const { error } = await supabase
    .from("users")
    .delete()
    .eq("auth_provider", "google")
    .eq("auth_subject", authSubject);

  if (error) {
    throw new Error(`Failed to cleanup smoke user: ${error.message}`);
  }
}

function buildPdfObject(objectNumber: number, body: string) {
  return `${objectNumber} 0 obj\n${body}\nendobj\n`;
}

export function buildMinimalPdfBlob(text: string) {
  const escapedText = text.replace(/[()\\]/g, "\\$&");
  const stream = `BT /F1 12 Tf 72 720 Td (${escapedText}) Tj ET`;
  const objects = [
    buildPdfObject(1, "<< /Type /Catalog /Pages 2 0 R >>"),
    buildPdfObject(2, "<< /Type /Pages /Kids [3 0 R] /Count 1 >>"),
    buildPdfObject(
      3,
      "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    ),
    buildPdfObject(
      4,
      `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    ),
    buildPdfObject(5, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"),
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];

  for (const object of objects) {
    offsets.push(Buffer.byteLength(pdf, "utf8"));
    pdf += object;
  }

  const xrefOffset = Buffer.byteLength(pdf, "utf8");
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";

  for (const offset of offsets.slice(1)) {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  }

  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  return new Blob([pdf], {
    type: "application/pdf",
  });
}

export async function cleanupKnowledgeDocument(input: {
  datasetVersion: string;
  docId: string;
  documentVersion: number;
  openAI: OpenAIAdapter;
  supabase: SupabaseAdminClient;
}) {
  const warnings: string[] = [];
  const { data: rows, error: loadError } = await input.supabase
    .from("knowledge_documents")
    .select("canonical_path, openai_file_id, vector_store_id")
    .eq("dataset_version", input.datasetVersion)
    .eq("doc_id", input.docId)
    .eq("document_version", input.documentVersion)
    .returns<
      Array<{
        canonical_path: string;
        openai_file_id: string | null;
        vector_store_id: string | null;
      }>
    >();

  if (loadError) {
    throw new Error(
      `Failed to load document for cleanup: ${loadError.message}`,
    );
  }

  const row = rows?.[0] ?? null;

  if (row?.openai_file_id && row.vector_store_id) {
    try {
      await input.openAI.deleteVectorStoreFile(
        row.vector_store_id,
        row.openai_file_id,
      );
    } catch (error) {
      warnings.push(
        `vector store file cleanup failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  if (row?.openai_file_id) {
    try {
      await input.openAI.deleteFile(row.openai_file_id);
    } catch (error) {
      warnings.push(
        `OpenAI file cleanup failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  if (row?.canonical_path) {
    const { error } = await input.supabase.storage
      .from("knowledge-documents")
      .remove([row.canonical_path]);

    if (error) {
      warnings.push(`storage cleanup failed: ${error.message}`);
    }
  }

  const { error: deleteError } = await input.supabase
    .from("knowledge_documents")
    .delete()
    .eq("dataset_version", input.datasetVersion)
    .eq("doc_id", input.docId)
    .eq("document_version", input.documentVersion);

  if (deleteError) {
    warnings.push(`catalog cleanup failed: ${deleteError.message}`);
  }

  return {
    found: row !== null,
    warnings,
  };
}

export function assertNoCleanupWarnings(warnings: string[]) {
  assert.deepEqual(warnings, [], `Cleanup warnings: ${warnings.join("; ")}`);
}
