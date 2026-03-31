import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { setTimeout as sleep } from "node:timers/promises";

import { createClient } from "@supabase/supabase-js";
import { encode } from "next-auth/jwt";

const AUTH_COOKIE_NAME = "authjs.session-token";
const SERVER_HOST = "127.0.0.1";
const SERVER_PORT = Number(process.env.LIVE_CHAT_TEST_PORT ?? "3010");
const SERVER_START_TIMEOUT_MS = 30_000;
const REQUEST_TIMEOUT_MS = 45_000;
const SERVER_READY_LOG_FRAGMENT = "Ready";

type JsonResponse<T = unknown> = {
  headers: Headers;
  json: T | null;
  status: number;
  text: string;
};

type ChatCitation = {
  documentId: string;
  documentName: string;
  fileId: string;
  snippet: string;
  vectorStoreId: string;
};

type ChatSuccessPayload = {
  citations: ChatCitation[];
  conversationId: string;
  grounded: boolean;
  messageId: string;
  text: string;
};

type InvalidPayloadResponse = {
  issues: {
    conversationId?: string[];
    message?: string[];
  };
  message: string;
};

type MeResponse = {
  id: string;
};

function assertChatPayloadContract(
  payload: ChatSuccessPayload | null,
  activeVectorStoreId: string,
) {
  assert.ok(payload, "Expected chat response JSON.");
  assert.equal(typeof payload?.text, "string");
  assert.ok(
    (payload?.text ?? "").trim().length > 0,
    "Expected chat response text to be non-empty.",
  );
  assert.match(payload?.messageId ?? "", /^resp_/);
  assert.equal(Array.isArray(payload?.citations), true);
  assert.equal(typeof payload?.grounded, "boolean");

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
    assert.equal(citation.vectorStoreId, activeVectorStoreId);
  }
}

function getRequiredEnv(name: string) {
  const value = process.env[name];

  if (typeof value === "string" && value.trim().length > 0) {
    return value;
  }

  throw new Error(`Missing required environment variable: ${name}`);
}

function getBaseUrl(port: number) {
  return `http://${SERVER_HOST}:${port}`;
}

function buildCookieHeader(cookieValue: string) {
  return `${AUTH_COOKIE_NAME}=${cookieValue}`;
}

function loadLocalEnvFiles() {
  for (const fileName of [".env", ".env.local"]) {
    const filePath = path.join(process.cwd(), fileName);

    if (existsSync(filePath)) {
      process.loadEnvFile?.(filePath);
    }
  }
}

function createSupabaseAdminClient() {
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

async function runNodeProcess(args: string[], label: string) {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd: process.cwd(),
      env: process.env,
      stdio: "inherit",
    });

    child.once("error", (error) => {
      reject(new Error(`${label} failed to start: ${error.message}`));
    });

    child.once("exit", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(
        new Error(
          `${label} failed with ${
            signal ? `signal ${signal}` : `exit code ${code ?? "unknown"}`
          }.`,
        ),
      );
    });
  });
}

async function startServer(port: number) {
  const nextBin = path.join(
    process.cwd(),
    "node_modules",
    "next",
    "dist",
    "bin",
    "next",
  );
  const stdout: string[] = [];
  const stderr: string[] = [];
  const child = spawn(
    process.execPath,
    [nextBin, "start", "--port", `${port}`],
    {
      cwd: process.cwd(),
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    const text = String(chunk);
    stdout.push(text);
    process.stdout.write(text);
  });
  child.stderr.on("data", (chunk) => {
    const text = String(chunk);
    stderr.push(text);
    process.stderr.write(text);
  });

  await waitForServerReady({
    baseUrl: getBaseUrl(port),
    child,
    stderr,
    stdout,
  });

  return {
    child,
    stderr,
    stdout,
  };
}

async function waitForServerReady(input: {
  baseUrl: string;
  child: ReturnType<typeof spawn>;
  stderr: string[];
  stdout: string[];
}) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < SERVER_START_TIMEOUT_MS) {
    if (input.child.exitCode !== null) {
      throw new Error(
        [
          "Live chat smoke server exited before becoming ready.",
          "",
          "stdout:",
          input.stdout.join(""),
          "",
          "stderr:",
          input.stderr.join(""),
        ].join("\n"),
      );
    }

    if (
      input.stdout.some((line) => line.includes(SERVER_READY_LOG_FRAGMENT)) ||
      input.stderr.some((line) => line.includes(SERVER_READY_LOG_FRAGMENT))
    ) {
      return;
    }

    try {
      const response = await fetch(`${input.baseUrl}/api/me`, {
        signal: AbortSignal.timeout(1_000),
      });

      if (response.status === 401 || response.status === 200) {
        return;
      }
    } catch {
      // Ignore until timeout.
    }

    await sleep(250);
  }

  throw new Error(
    [
      `Live chat smoke server did not become ready within ${SERVER_START_TIMEOUT_MS}ms.`,
      "",
      "stdout:",
      input.stdout.join(""),
      "",
      "stderr:",
      input.stderr.join(""),
    ].join("\n"),
  );
}

async function stopServer(child: ReturnType<typeof spawn>) {
  if (child.exitCode !== null) {
    return;
  }

  child.kill("SIGTERM");

  await Promise.race([
    new Promise<void>((resolve) => {
      child.once("exit", () => resolve());
    }),
    sleep(5_000).then(() => {
      if (child.exitCode === null) {
        child.kill("SIGKILL");
      }
    }),
  ]);
}

async function requestJson<T = unknown>(
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
    json: text.length > 0 ? (JSON.parse(text) as T) : null,
    status: response.status,
    text,
  };
}

async function requestChatJsonWithRetry<T = unknown>(
  url: string,
  init?: RequestInit,
  retries = 1,
): Promise<JsonResponse<T>> {
  let response = await requestJson<T>(url, init);

  for (let attempt = 0; attempt < retries; attempt += 1) {
    if (response.status !== 502 && response.status !== 504) {
      return response;
    }

    await sleep(1_000);
    response = await requestJson<T>(url, init);
  }

  return response;
}

async function cleanupUserData(authSubject: string) {
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase
    .from("users")
    .delete()
    .eq("auth_provider", "google")
    .eq("auth_subject", authSubject);

  if (error) {
    throw new Error(`Failed to cleanup live chat smoke user: ${error.message}`);
  }
}

async function loadPersistedConversation(input: {
  authSubject: string;
  conversationId: string;
}) {
  const supabase = createSupabaseAdminClient();
  const { data: userRow, error: userError } = await supabase
    .from("users")
    .select("id")
    .eq("auth_provider", "google")
    .eq("auth_subject", input.authSubject)
    .maybeSingle<{ id: string }>();

  if (userError) {
    throw new Error(
      `Failed to load live chat smoke user: ${userError.message}`,
    );
  }

  assert.ok(userRow?.id, "Expected smoke user to be persisted in users.");

  const { data: conversationRow, error: conversationError } = await supabase
    .from("conversations")
    .select("id, user_id, title, status")
    .eq("id", input.conversationId)
    .eq("user_id", userRow.id)
    .maybeSingle<{
      id: string;
      status: string;
      title: string | null;
      user_id: string;
    }>();

  if (conversationError) {
    throw new Error(
      `Failed to load live chat smoke conversation: ${conversationError.message}`,
    );
  }

  const { data: messages, error: messagesError } = await supabase
    .from("messages")
    .select("id, role, content")
    .eq("conversation_id", input.conversationId)
    .order("created_at", { ascending: true })
    .returns<Array<{ content: string; id: string; role: string }>>();

  if (messagesError) {
    throw new Error(
      `Failed to load live chat smoke messages: ${messagesError.message}`,
    );
  }

  return {
    conversation: conversationRow,
    messages: messages ?? [],
    userId: userRow.id,
  };
}

async function main() {
  loadLocalEnvFiles();
  Reflect.deleteProperty(process.env, "NODE_ENV");

  getRequiredEnv("AUTH_SECRET");
  getRequiredEnv("OPENAI_API_KEY");
  getRequiredEnv("NEXT_PUBLIC_SUPABASE_URL");
  getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY");

  const authSubject = `live-chat-${Date.now()}-${randomUUID().slice(0, 8)}`;
  const authCookie = await encode({
    salt: AUTH_COOKIE_NAME,
    secret: getRequiredEnv("AUTH_SECRET"),
    token: {
      appUserId: `google:${authSubject}`,
      authSubject,
      email: `${authSubject}@example.com`,
      emailVerified: true,
      name: "Live Chat Smoke",
      picture: null,
      provider: "google",
      role: "user",
      sub: authSubject,
    },
  });
  const cookieHeader = buildCookieHeader(authCookie);
  const baseUrl = getBaseUrl(SERVER_PORT);
  const activeVectorStoreId = getRequiredEnv("OPENAI_ACTIVE_VECTOR_STORE_ID");
  const prompt1 = "Responde exactamente con: BOTANICA";
  const prompt2 = "Gracias";

  let server: Awaited<ReturnType<typeof startServer>> | null = null;

  try {
    await runNodeProcess(
      [
        path.join(process.cwd(), "node_modules", "next", "dist", "bin", "next"),
        "build",
      ],
      "next build for live chat smoke",
    );
    server = await startServer(SERVER_PORT);

    const anonymousChat = await requestJson<{ message: string }>(
      `${baseUrl}/api/chat`,
      {
        body: JSON.stringify({
          message: "Consulta anonima",
        }),
        headers: {
          "content-type": "application/json",
        },
        method: "POST",
      },
    );
    assert.equal(anonymousChat.status, 401);
    assert.deepEqual(anonymousChat.json, {
      message: "Not authenticated",
    });

    const authenticatedMe = await requestJson<MeResponse>(`${baseUrl}/api/me`, {
      headers: {
        cookie: cookieHeader,
      },
    });
    assert.equal(authenticatedMe.status, 200);
    assert.equal(authenticatedMe.json?.id, `google:${authSubject}`);

    const invalidPayload = await requestJson<InvalidPayloadResponse>(
      `${baseUrl}/api/chat`,
      {
        body: JSON.stringify({
          message: "   ",
        }),
        headers: {
          cookie: cookieHeader,
          "content-type": "application/json",
        },
        method: "POST",
      },
    );
    assert.equal(invalidPayload.status, 400);
    assert.deepEqual(invalidPayload.json, {
      issues: {
        message: ["Message must not be empty."],
      },
      message: "Invalid request payload",
    });

    const firstChatResponse =
      await requestChatJsonWithRetry<ChatSuccessPayload>(
        `${baseUrl}/api/chat`,
        {
          body: JSON.stringify({
            message: prompt1,
          }),
          headers: {
            cookie: cookieHeader,
            "content-type": "application/json",
          },
          method: "POST",
        },
      );
    assert.equal(firstChatResponse.status, 200);
    assertChatPayloadContract(firstChatResponse.json, activeVectorStoreId);
    assert.match(
      firstChatResponse.json?.conversationId ?? "",
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );

    const firstConversationState = await loadPersistedConversation({
      authSubject,
      conversationId: firstChatResponse.json?.conversationId ?? "",
    });
    assert.equal(firstConversationState.conversation?.status, "active");
    assert.equal(firstConversationState.messages.length, 1);
    assert.equal(firstConversationState.messages[0]?.role, "user");
    assert.equal(firstConversationState.messages[0]?.content, prompt1);

    const invalidConversation = await requestJson<InvalidPayloadResponse>(
      `${baseUrl}/api/chat`,
      {
        body: JSON.stringify({
          conversationId: "00000000-0000-0000-0000-000000000000",
          message: "Hola",
        }),
        headers: {
          cookie: cookieHeader,
          "content-type": "application/json",
        },
        method: "POST",
      },
    );
    assert.equal(invalidConversation.status, 400);
    assert.deepEqual(invalidConversation.json, {
      issues: {
        conversationId: ["Invalid conversationId."],
      },
      message: "Invalid request payload",
    });

    const continuedChatResponse =
      await requestChatJsonWithRetry<ChatSuccessPayload>(
        `${baseUrl}/api/chat`,
        {
          body: JSON.stringify({
            conversationId: firstChatResponse.json?.conversationId,
            message: prompt2,
          }),
          headers: {
            cookie: cookieHeader,
            "content-type": "application/json",
          },
          method: "POST",
        },
      );
    assert.equal(continuedChatResponse.status, 200);
    assertChatPayloadContract(continuedChatResponse.json, activeVectorStoreId);
    assert.equal(
      continuedChatResponse.json?.conversationId,
      firstChatResponse.json?.conversationId,
    );

    const secondConversationState = await loadPersistedConversation({
      authSubject,
      conversationId: firstChatResponse.json?.conversationId ?? "",
    });
    assert.equal(secondConversationState.messages.length, 1);
    assert.equal(secondConversationState.messages[0]?.content, prompt1);

    const chatPage = await fetch(
      `${baseUrl}/chat?conversation=${firstChatResponse.json?.conversationId ?? ""}`,
      {
        headers: {
          cookie: cookieHeader,
        },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      },
    );
    const chatPageHtml = await chatPage.text();
    assert.equal(chatPage.status, 200);
    assert.ok(
      chatPageHtml.includes(prompt1),
      "Expected SSR chat page to include the first persisted user message.",
    );

    console.log(
      JSON.stringify(
        {
          ok: true,
          checks: {
            anonymous401: true,
            authenticatedMe200: true,
            invalidPayload400: true,
            invalidConversation400: true,
            newConversation200: true,
            continuation200: true,
            ssrChatHydrationVisible: true,
            firstUserMessagePersisted: true,
            followUpStillNotPersistedUntilT38: true,
          },
          conversationId: firstChatResponse.json?.conversationId ?? null,
          firstMessageId: firstChatResponse.json?.messageId ?? null,
          secondMessageId: continuedChatResponse.json?.messageId ?? null,
        },
        null,
        2,
      ),
    );
  } finally {
    try {
      await cleanupUserData(authSubject);
    } catch (error) {
      console.error(
        `Warning: failed to cleanup live chat smoke data for ${authSubject}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      process.exitCode = 1;
    }

    if (server) {
      await stopServer(server.child);
    }
  }
}

main().catch((error) => {
  console.error(
    error instanceof Error ? (error.stack ?? error.message) : String(error),
  );
  process.exitCode = 1;
});
