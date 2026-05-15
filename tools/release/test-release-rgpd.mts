import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import {
  assertNoStore,
  assertRequestIdHeader,
  cleanupUserData,
  createSupabaseAdminClient,
  createSyntheticIdentity,
  getReleaseBaseUrl,
  loadPersistedUserId,
  loadReleaseEnvFiles,
  requestJson,
  resolveExpectedActiveDatasetForSmoke,
} from "./release-smoke-utils.mjs";

type PrivacyExportPayload = {
  consents: Array<{
    consentType: string;
    status: string;
  }>;
  conversations: Array<{
    datasetVersion: string | null;
    messages: Array<{
      citations: Array<{
        documentId: string;
        vectorStoreId: string;
      }>;
      grounded: boolean;
      providerMessageId: string | null;
      role: string;
    }>;
    vectorStoreId: string | null;
  }>;
  profile: {
    displayName: string | null;
  };
  roles: string[];
  schemaVersion: string;
  subject: {
    authSubject: string;
    id: string;
    persistedUserId: string;
  };
};

type PrivacyDeletePayload = {
  deleted: true;
  deletedAt: string;
  schemaVersion: string;
};

async function countRows(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  table: string,
) {
  const { count, error } = await supabase
    .from(table)
    .select("*", { count: "exact", head: true });

  if (error) {
    throw new Error(`Failed to count ${table}: ${error.message}`);
  }

  return count ?? 0;
}

async function countUserRows(input: {
  column: string;
  supabase: ReturnType<typeof createSupabaseAdminClient>;
  table: string;
  userId: string;
}) {
  const { count, error } = await input.supabase
    .from(input.table)
    .select("*", { count: "exact", head: true })
    .eq(input.column, input.userId);

  if (error) {
    throw new Error(`Failed to count ${input.table}: ${error.message}`);
  }

  return count ?? 0;
}

async function countCitationRows(input: {
  messageIds: string[];
  supabase: ReturnType<typeof createSupabaseAdminClient>;
}) {
  if (input.messageIds.length === 0) {
    return 0;
  }

  const { count, error } = await input.supabase
    .from("message_citations")
    .select("*", { count: "exact", head: true })
    .in("message_id", input.messageIds);

  if (error) {
    throw new Error(`Failed to count message_citations: ${error.message}`);
  }

  return count ?? 0;
}

async function seedPrivacyRows(input: {
  activeDataset: Awaited<
    ReturnType<typeof resolveExpectedActiveDatasetForSmoke>
  >;
  supabase: ReturnType<typeof createSupabaseAdminClient>;
  userId: string;
}) {
  const now = new Date();
  const providerMessageId = `resp_release_rgpd_${randomUUID().replaceAll("-", "")}`;

  const { data: conversation, error: conversationError } = await input.supabase
    .from("conversations")
    .insert({
      dataset_version: input.activeDataset.datasetVersion,
      last_message_at: now.toISOString(),
      status: "active",
      title: "Release RGPD smoke",
      updated_at: now.toISOString(),
      user_id: input.userId,
      vector_store_id: input.activeDataset.vectorStoreId,
    })
    .select("id")
    .single<{ id: string }>();

  if (conversationError || !conversation) {
    throw new Error(
      `Failed to seed RGPD conversation: ${conversationError?.message}`,
    );
  }

  const { data: messages, error: messagesError } = await input.supabase
    .from("messages")
    .insert([
      {
        content: "Release RGPD user message",
        conversation_id: conversation.id,
        created_at: now.toISOString(),
        role: "user",
        user_id: input.userId,
      },
      {
        content: "Release RGPD assistant message",
        conversation_id: conversation.id,
        created_at: new Date(now.getTime() + 1).toISOString(),
        provider_message_id: providerMessageId,
        role: "assistant",
        user_id: input.userId,
      },
    ])
    .select("id, role")
    .returns<Array<{ id: string; role: string }>>();

  if (messagesError || !messages) {
    throw new Error(`Failed to seed RGPD messages: ${messagesError?.message}`);
  }

  const assistantMessage = messages.find(
    (message) => message.role === "assistant",
  );

  assert.ok(assistantMessage, "Expected seeded assistant message.");

  const { error: citationError } = await input.supabase
    .from("message_citations")
    .insert({
      citation_index: 0,
      document_id: "botanica-mvp-v1-corpus-mvp",
      document_name: "Corpus MVP botanico release",
      file_id: "file-release-rgpd-smoke",
      message_id: assistantMessage.id,
      snippet: "Botanica es la rama de la biologia que estudia las plantas.",
      vector_store_id: input.activeDataset.vectorStoreId,
    });

  if (citationError) {
    throw new Error(`Failed to seed RGPD citation: ${citationError.message}`);
  }

  const { error: consentError } = await input.supabase.from("consents").insert({
    consent_type: "release_rgpd_smoke",
    granted_at: now.toISOString(),
    source: "release-smoke",
    status: "granted",
    updated_at: now.toISOString(),
    user_id: input.userId,
  });

  if (consentError) {
    throw new Error(`Failed to seed RGPD consent: ${consentError.message}`);
  }

  const windowStart = new Date(now);
  windowStart.setSeconds(0, 0);

  const { error: rateLimitError } = await input.supabase
    .from("chat_rate_limits")
    .upsert({
      request_count: 1,
      updated_at: now.toISOString(),
      user_id: input.userId,
      window_start: windowStart.toISOString(),
    });

  if (rateLimitError) {
    throw new Error(
      `Failed to seed RGPD rate limit row: ${rateLimitError.message}`,
    );
  }

  return {
    conversationId: conversation.id,
    messageIds: messages.map((message) => message.id),
    providerMessageId,
  };
}

async function assertPersonalRowsRemoved(input: {
  messageIds: string[];
  supabase: ReturnType<typeof createSupabaseAdminClient>;
  userId: string;
}) {
  const remaining = {
    chatRateLimits: await countUserRows({
      column: "user_id",
      supabase: input.supabase,
      table: "chat_rate_limits",
      userId: input.userId,
    }),
    citations: await countCitationRows({
      messageIds: input.messageIds,
      supabase: input.supabase,
    }),
    consents: await countUserRows({
      column: "user_id",
      supabase: input.supabase,
      table: "consents",
      userId: input.userId,
    }),
    conversations: await countUserRows({
      column: "user_id",
      supabase: input.supabase,
      table: "conversations",
      userId: input.userId,
    }),
    messages: await countUserRows({
      column: "user_id",
      supabase: input.supabase,
      table: "messages",
      userId: input.userId,
    }),
    profiles: await countUserRows({
      column: "user_id",
      supabase: input.supabase,
      table: "profiles",
      userId: input.userId,
    }),
    userRoles: await countUserRows({
      column: "user_id",
      supabase: input.supabase,
      table: "user_roles",
      userId: input.userId,
    }),
    users: await countUserRows({
      column: "id",
      supabase: input.supabase,
      table: "users",
      userId: input.userId,
    }),
  };

  assert.deepEqual(remaining, {
    chatRateLimits: 0,
    citations: 0,
    consents: 0,
    conversations: 0,
    messages: 0,
    profiles: 0,
    userRoles: 0,
    users: 0,
  });

  return remaining;
}

async function main() {
  loadReleaseEnvFiles();

  const baseUrl = getReleaseBaseUrl();
  const supabase = createSupabaseAdminClient();
  const activeDataset = await resolveExpectedActiveDatasetForSmoke(supabase);
  const identity = await createSyntheticIdentity({
    baseUrl,
    name: "release-rgpd-smoke",
  });
  let userId: string | null = null;
  let seededMessageIds: string[] = [];

  try {
    const rolesBefore = await countRows(supabase, "roles");
    const knowledgeDocumentsBefore = await countRows(
      supabase,
      "knowledge_documents",
    );

    const me = await requestJson<{
      id: string;
    }>(`${baseUrl}/api/me`, {
      headers: {
        cookie: identity.cookieHeader,
      },
    });
    assert.equal(me.status, 200);
    assert.equal(me.json?.id, identity.publicUserId);
    assertRequestIdHeader(me.headers, "RGPD authenticated /api/me");

    userId = await loadPersistedUserId(supabase, identity.authSubject);
    const seeded = await seedPrivacyRows({
      activeDataset,
      supabase,
      userId,
    });
    seededMessageIds = seeded.messageIds;

    const exported = await requestJson<PrivacyExportPayload>(
      `${baseUrl}/api/me/export`,
      {
        headers: {
          cookie: identity.cookieHeader,
        },
      },
    );
    assert.equal(exported.status, 200);
    assertNoStore(exported.headers, "RGPD export");
    assertRequestIdHeader(exported.headers, "RGPD export");
    assert.equal(exported.json?.schemaVersion, "rgpd-export-v1");
    assert.equal(exported.json?.subject.id, identity.publicUserId);
    assert.equal(exported.json?.subject.authSubject, identity.authSubject);
    assert.equal(exported.json?.subject.persistedUserId, userId);
    assert.ok(exported.json?.roles.includes("user"));
    assert.ok(
      exported.json?.consents.some(
        (consent) => consent.consentType === "release_rgpd_smoke",
      ),
      "Expected RGPD export to include seeded consent.",
    );

    const exportedConversation = exported.json?.conversations.find(
      (conversation) => conversation.messages.length >= 2,
    );
    assert.ok(exportedConversation, "Expected seeded conversation in export.");
    assert.equal(
      exportedConversation.datasetVersion,
      activeDataset.datasetVersion,
    );
    assert.equal(
      exportedConversation.vectorStoreId,
      activeDataset.vectorStoreId,
    );
    assert.ok(
      exportedConversation.messages.some(
        (message) =>
          message.role === "assistant" &&
          message.providerMessageId === seeded.providerMessageId &&
          message.grounded &&
          message.citations.some(
            (citation) =>
              citation.documentId === "botanica-mvp-v1-corpus-mvp" &&
              citation.vectorStoreId === activeDataset.vectorStoreId,
          ),
      ),
      "Expected RGPD export to include assistant message citation.",
    );

    const deleted = await requestJson<PrivacyDeletePayload>(
      `${baseUrl}/api/me`,
      {
        headers: {
          cookie: identity.cookieHeader,
        },
        method: "DELETE",
      },
    );
    assert.equal(deleted.status, 200);
    assertNoStore(deleted.headers, "RGPD delete");
    assertRequestIdHeader(deleted.headers, "RGPD delete");
    assert.deepEqual(deleted.json, {
      deleted: true,
      deletedAt: deleted.json?.deletedAt,
      schemaVersion: "rgpd-delete-v1",
    });
    assert.match(deleted.json?.deletedAt ?? "", /^\d{4}-\d{2}-\d{2}T/);

    const remaining = await assertPersonalRowsRemoved({
      messageIds: seededMessageIds,
      supabase,
      userId,
    });
    assert.equal(await countRows(supabase, "roles"), rolesBefore);
    assert.equal(
      await countRows(supabase, "knowledge_documents"),
      knowledgeDocumentsBefore,
    );

    console.log(
      JSON.stringify(
        {
          ok: true,
          checks: {
            deleteNoStore: true,
            deleteSchema: true,
            exportNoStore: true,
            exportSchema: true,
            exportUserScoped: true,
            personalRowsRemoved: true,
            sharedKnowledgeDocumentsPreserved: true,
            sharedRolesPreserved: true,
          },
          activeDataset,
          baseUrl,
          remaining,
          seededConversationId: seeded.conversationId,
        },
        null,
        2,
      ),
    );

    userId = null;
  } finally {
    if (userId) {
      await cleanupUserData(supabase, identity.authSubject);
    }
  }
}

main().catch((error) => {
  console.error(
    error instanceof Error ? (error.stack ?? error.message) : String(error),
  );
  process.exitCode = 1;
});
