import assert from "node:assert/strict";

import {
  assertChatPayloadContract,
  assertNoCleanupWarnings,
  assertRequestIdHeader,
  buildMinimalPdfBlob,
  cleanupKnowledgeDocument,
  cleanupUserData,
  createOpenAIClient,
  createSupabaseAdminClient,
  createSyntheticIdentity,
  getReleaseBaseUrl,
  loadPersistedUserId,
  loadReleaseEnvFiles,
  requestChatJsonWithRetry,
  requestJson,
  requestText,
  resolveExpectedActiveDatasetForSmoke,
  seedRoleCode,
  toNormalizedVisibleText,
  type ChatCitation,
  type ChatSuccessPayload,
  type InvalidPayloadResponse,
  type MeResponse,
} from "./release-smoke-utils.mjs";

type PersistedMessage = {
  citations: ChatCitation[];
  content: string;
  id: string;
  providerMessageId: string | null;
  role: string;
};

async function loadPersistedConversation(input: {
  authSubject: string;
  conversationId: string;
  supabase: ReturnType<typeof createSupabaseAdminClient>;
}) {
  const userId = await loadPersistedUserId(input.supabase, input.authSubject);
  const { data: conversation, error: conversationError } = await input.supabase
    .from("conversations")
    .select("id, user_id, title, status, dataset_version, vector_store_id")
    .eq("id", input.conversationId)
    .eq("user_id", userId)
    .maybeSingle<{
      dataset_version: string | null;
      id: string;
      status: string;
      title: string | null;
      user_id: string;
      vector_store_id: string | null;
    }>();

  if (conversationError) {
    throw new Error(
      `Failed to load smoke conversation: ${conversationError.message}`,
    );
  }

  assert.ok(conversation, "Expected smoke conversation to be persisted.");

  const { data: messages, error: messagesError } = await input.supabase
    .from("messages")
    .select("id, role, content, provider_message_id")
    .eq("conversation_id", input.conversationId)
    .order("created_at", { ascending: true })
    .returns<
      Array<{
        content: string;
        id: string;
        provider_message_id: string | null;
        role: string;
      }>
    >();

  if (messagesError) {
    throw new Error(`Failed to load smoke messages: ${messagesError.message}`);
  }

  const messageIds = (messages ?? []).map((message) => message.id);
  const citationsByMessageId = new Map<string, ChatCitation[]>();

  if (messageIds.length > 0) {
    const { data: citationRows, error: citationError } = await input.supabase
      .from("message_citations")
      .select(
        "message_id, citation_index, document_id, document_name, file_id, snippet, vector_store_id",
      )
      .in("message_id", messageIds)
      .order("citation_index", { ascending: true })
      .returns<
        Array<{
          citation_index: number;
          document_id: string;
          document_name: string;
          file_id: string;
          message_id: string;
          snippet: string;
          vector_store_id: string;
        }>
      >();

    if (citationError) {
      throw new Error(
        `Failed to load smoke citations: ${citationError.message}`,
      );
    }

    for (const citationRow of citationRows ?? []) {
      const citations = citationsByMessageId.get(citationRow.message_id) ?? [];
      citations.push({
        documentId: citationRow.document_id,
        documentName: citationRow.document_name,
        fileId: citationRow.file_id,
        snippet: citationRow.snippet,
        vectorStoreId: citationRow.vector_store_id,
      });
      citationsByMessageId.set(citationRow.message_id, citations);
    }
  }

  return {
    conversation,
    messages: (messages ?? []).map(
      (message): PersistedMessage => ({
        citations: citationsByMessageId.get(message.id) ?? [],
        content: message.content,
        id: message.id,
        providerMessageId: message.provider_message_id,
        role: message.role,
      }),
    ),
  };
}

async function main() {
  loadReleaseEnvFiles();

  const baseUrl = getReleaseBaseUrl();
  const supabase = createSupabaseAdminClient();
  const openAI = createOpenAIClient();
  const expectedActiveDataset =
    await resolveExpectedActiveDatasetForSmoke(supabase);
  const userIdentity = await createSyntheticIdentity({
    baseUrl,
    name: "release-smoke-user",
  });
  const adminIdentity = await createSyntheticIdentity({
    baseUrl,
    name: "release-smoke-admin",
    role: "admin",
  });
  const uploadDocId = `release-smoke-${Date.now()}`;
  const uploadDocumentVersion = 1;
  const cleanupWarnings: string[] = [];

  try {
    const home = await requestText(`${baseUrl}/`);
    assert.equal(home.status, 200);
    assertRequestIdHeader(home.headers, "home");
    assert.match(home.text, /SintonIA/i);

    const anonymousChatPage = await fetch(`${baseUrl}/chat`, {
      redirect: "manual",
      signal: AbortSignal.timeout(30_000),
    });
    assert.ok(
      [302, 303, 307, 308].includes(anonymousChatPage.status),
      `Expected anonymous /chat to redirect, got ${anonymousChatPage.status}.`,
    );
    assert.match(
      anonymousChatPage.headers.get("location") ?? "",
      /\/sign-in\?callbackUrl=/,
    );
    assertRequestIdHeader(anonymousChatPage.headers, "anonymous /chat");

    const anonymousAdminUpload = await requestJson<{ message: string }>(
      `${baseUrl}/api/admin/knowledge/documents`,
      {
        method: "POST",
      },
    );
    assert.equal(anonymousAdminUpload.status, 401);
    assert.deepEqual(anonymousAdminUpload.json, {
      message: "Not authenticated",
    });
    assertRequestIdHeader(
      anonymousAdminUpload.headers,
      "anonymous admin upload",
    );

    const authenticatedMe = await requestJson<MeResponse>(`${baseUrl}/api/me`, {
      headers: {
        cookie: userIdentity.cookieHeader,
      },
    });
    assert.equal(authenticatedMe.status, 200);
    assert.equal(authenticatedMe.json?.id, userIdentity.publicUserId);
    assertRequestIdHeader(authenticatedMe.headers, "authenticated /api/me");

    const invalidPayload = await requestJson<InvalidPayloadResponse>(
      `${baseUrl}/api/chat`,
      {
        body: JSON.stringify({
          message: "   ",
        }),
        headers: {
          cookie: userIdentity.cookieHeader,
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
    assertRequestIdHeader(invalidPayload.headers, "invalid chat payload");

    const prompt1 =
      "Segun el corpus documental, que estudia la botanica? Responde breve y cita la fuente.";
    const prompt2 = "Resume la respuesta anterior en una frase.";
    const firstChatResponse =
      await requestChatJsonWithRetry<ChatSuccessPayload>(
        `${baseUrl}/api/chat`,
        {
          body: JSON.stringify({
            message: prompt1,
          }),
          headers: {
            cookie: userIdentity.cookieHeader,
            "content-type": "application/json",
          },
          method: "POST",
        },
      );
    assert.equal(firstChatResponse.status, 200);
    assertRequestIdHeader(firstChatResponse.headers, "first chat");
    assertChatPayloadContract(
      firstChatResponse.json,
      expectedActiveDataset.vectorStoreId,
      {
        requireGrounded: true,
      },
    );

    const firstConversationState = await loadPersistedConversation({
      authSubject: userIdentity.authSubject,
      conversationId: firstChatResponse.json?.conversationId ?? "",
      supabase,
    });
    assert.equal(firstConversationState.conversation.status, "active");
    assert.equal(
      firstConversationState.conversation.dataset_version,
      expectedActiveDataset.datasetVersion,
    );
    assert.equal(
      firstConversationState.conversation.vector_store_id,
      expectedActiveDataset.vectorStoreId,
    );
    assert.equal(firstConversationState.messages.length, 2);
    assert.equal(firstConversationState.messages[0]?.role, "user");
    assert.equal(firstConversationState.messages[0]?.content, prompt1);
    assert.equal(firstConversationState.messages[1]?.role, "assistant");
    assert.equal(
      firstConversationState.messages[1]?.providerMessageId,
      firstChatResponse.json?.messageId,
    );
    assert.ok(
      (firstConversationState.messages[1]?.citations.length ?? 0) > 0,
      "Expected grounded assistant response citations to persist.",
    );

    const continuedChatResponse =
      await requestChatJsonWithRetry<ChatSuccessPayload>(
        `${baseUrl}/api/chat`,
        {
          body: JSON.stringify({
            conversationId: firstChatResponse.json?.conversationId,
            message: prompt2,
          }),
          headers: {
            cookie: userIdentity.cookieHeader,
            "content-type": "application/json",
          },
          method: "POST",
        },
      );
    assert.equal(continuedChatResponse.status, 200);
    assertRequestIdHeader(continuedChatResponse.headers, "continued chat");
    assert.equal(
      continuedChatResponse.json?.conversationId,
      firstChatResponse.json?.conversationId,
    );
    assertChatPayloadContract(
      continuedChatResponse.json,
      expectedActiveDataset.vectorStoreId,
    );

    const secondConversationState = await loadPersistedConversation({
      authSubject: userIdentity.authSubject,
      conversationId: firstChatResponse.json?.conversationId ?? "",
      supabase,
    });
    assert.equal(secondConversationState.messages.length, 4);
    assert.equal(secondConversationState.messages[2]?.content, prompt2);
    assert.equal(secondConversationState.messages[3]?.role, "assistant");
    assert.equal(
      secondConversationState.messages[3]?.providerMessageId,
      continuedChatResponse.json?.messageId,
    );

    const chatPage = await requestText(
      `${baseUrl}/chat?conversation=${firstChatResponse.json?.conversationId ?? ""}`,
      {
        headers: {
          cookie: userIdentity.cookieHeader,
        },
      },
    );
    assert.equal(chatPage.status, 200);
    assertRequestIdHeader(chatPage.headers, "SSR chat page");
    const chatVisibleText = toNormalizedVisibleText(chatPage.text);
    assert.ok(chatVisibleText.includes(toNormalizedVisibleText(prompt1)));
    assert.ok(
      chatVisibleText.includes(
        toNormalizedVisibleText(firstChatResponse.json?.text ?? ""),
      ),
    );
    assert.ok(chatVisibleText.includes(toNormalizedVisibleText(prompt2)));

    const adminMe = await requestJson<MeResponse>(`${baseUrl}/api/me`, {
      headers: {
        cookie: adminIdentity.cookieHeader,
      },
    });
    assert.equal(adminMe.status, 200);
    const adminUserId = await loadPersistedUserId(
      supabase,
      adminIdentity.authSubject,
    );
    await seedRoleCode(supabase, adminUserId, "admin");

    const adminMeAfterRole = await requestJson<MeResponse>(
      `${baseUrl}/api/me`,
      {
        headers: {
          cookie: adminIdentity.cookieHeader,
        },
      },
    );
    assert.equal(adminMeAfterRole.status, 200);
    assert.equal(adminMeAfterRole.json?.role, "admin");

    const adminPage = await requestText(`${baseUrl}/admin/knowledge`, {
      headers: {
        cookie: adminIdentity.cookieHeader,
      },
    });
    assert.equal(adminPage.status, 200);
    assertRequestIdHeader(adminPage.headers, "admin inventory page");
    assert.match(adminPage.text, /botanica-mvp-v1-corpus-mvp|Corpus MVP/i);

    const formData = new FormData();
    formData.set("datasetVersion", expectedActiveDataset.datasetVersion);
    formData.set("docId", uploadDocId);
    formData.set("documentVersion", String(uploadDocumentVersion));
    formData.set("title", "Release smoke document");
    formData.set(
      "file",
      buildMinimalPdfBlob(
        "Release smoke document for deployed admin upload validation.",
      ),
      `${uploadDocId}.pdf`,
    );

    const adminUpload = await requestJson<{
      document?: {
        canonicalPath: string;
        docId: string;
        openAIFileId: string | null;
        status: string;
        vectorStoreId: string | null;
      };
    }>(`${baseUrl}/api/admin/knowledge/documents`, {
      body: formData,
      headers: {
        cookie: adminIdentity.cookieHeader,
      },
      method: "POST",
    });
    assert.equal(adminUpload.status, 201);
    assertRequestIdHeader(adminUpload.headers, "admin upload API");
    assert.equal(adminUpload.json?.document?.docId, uploadDocId);
    assert.equal(adminUpload.json?.document?.status, "ready");
    assert.ok(adminUpload.json?.document?.openAIFileId);
    assert.equal(
      adminUpload.json?.document?.vectorStoreId,
      expectedActiveDataset.vectorStoreId,
    );

    console.log(
      JSON.stringify(
        {
          ok: true,
          checks: {
            adminInventory200: true,
            adminUpload201: true,
            anonymousAdmin401: true,
            anonymousChatRedirect: true,
            authenticatedMe200: true,
            citationsPersisted: true,
            continuation200: true,
            groundedChat200: true,
            invalidPayload400: true,
            publicHome200: true,
            requestIdsPresent: true,
            ssrChatHydrationVisible: true,
          },
          activeDataset: expectedActiveDataset,
          adminUploadDocId: uploadDocId,
          baseUrl,
          conversationId: firstChatResponse.json?.conversationId ?? null,
          firstMessageId: firstChatResponse.json?.messageId ?? null,
          secondMessageId: continuedChatResponse.json?.messageId ?? null,
        },
        null,
        2,
      ),
    );
  } finally {
    const uploadCleanup = await cleanupKnowledgeDocument({
      datasetVersion: expectedActiveDataset.datasetVersion,
      docId: uploadDocId,
      documentVersion: uploadDocumentVersion,
      openAI,
      supabase,
    });
    cleanupWarnings.push(...uploadCleanup.warnings);
    await cleanupUserData(supabase, userIdentity.authSubject);
    await cleanupUserData(supabase, adminIdentity.authSubject);
    assertNoCleanupWarnings(cleanupWarnings);
  }
}

main().catch((error) => {
  console.error(
    error instanceof Error ? (error.stack ?? error.message) : String(error),
  );
  process.exitCode = 1;
});
