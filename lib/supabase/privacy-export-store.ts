import "server-only";

import { z } from "zod";
import { buildAppUserId } from "@/lib/auth/identity";
import { appRoles, isAppRole, type AppRole } from "@/lib/auth/roles";
import { supabaseAdmin, type SupabaseAdminClient } from "./client";

export const PRIVACY_EXPORT_SCHEMA_VERSION = "rgpd-export-v1";

const timestampSchema = z.string().datetime({ offset: true });

const privacyExportUserRowSchema = z.object({
  auth_provider: z.string().min(1),
  auth_subject: z.string().min(1),
  created_at: timestampSchema,
  email: z.string().email().nullable(),
  email_verified_at: timestampSchema.nullable(),
  id: z.string().min(1),
  updated_at: timestampSchema,
});

const privacyExportProfileRowSchema = z.object({
  avatar_url: z.string().nullable(),
  created_at: timestampSchema,
  display_name: z.string().nullable(),
  locale: z.string().nullable(),
  timezone: z.string().nullable(),
  updated_at: timestampSchema,
});

const privacyExportUserRoleRowSchema = z.object({
  role_id: z.string().min(1),
});

const privacyExportRoleRowSchema = z.object({
  code: z.string().min(1),
  id: z.string().min(1),
});

const privacyExportConversationRowSchema = z.object({
  created_at: timestampSchema,
  dataset_version: z.string().min(1).nullable().default(null),
  id: z.string().min(1),
  last_message_at: timestampSchema.nullable(),
  status: z.string().min(1),
  title: z.string().nullable(),
  updated_at: timestampSchema,
  vector_store_id: z.string().min(1).nullable().default(null),
});

const privacyExportMessageRoleSchema = z.enum(["user", "assistant", "system"]);

const privacyExportMessageRowSchema = z.object({
  content: z.string(),
  conversation_id: z.string().min(1),
  created_at: timestampSchema,
  id: z.string().min(1),
  provider_message_id: z.string().min(1).nullable(),
  role: privacyExportMessageRoleSchema,
});

const privacyExportCitationRowSchema = z.object({
  citation_index: z.number().int().nonnegative(),
  document_id: z.string().min(1),
  document_name: z.string().min(1),
  file_id: z.string().min(1),
  message_id: z.string().min(1),
  snippet: z.string().min(1),
  vector_store_id: z.string().min(1),
});

const privacyExportConsentRowSchema = z.object({
  consent_type: z.string().min(1),
  created_at: timestampSchema,
  granted_at: timestampSchema.nullable(),
  id: z.string().min(1),
  revoked_at: timestampSchema.nullable(),
  source: z.string().nullable(),
  status: z.string().min(1),
  updated_at: timestampSchema,
});

type PrivacyExportUserRow = z.infer<typeof privacyExportUserRowSchema>;
type PrivacyExportProfileRow = z.infer<typeof privacyExportProfileRowSchema>;
type PrivacyExportUserRoleRow = z.infer<typeof privacyExportUserRoleRowSchema>;
type PrivacyExportRoleRow = z.infer<typeof privacyExportRoleRowSchema>;
type PrivacyExportConversationRow = z.infer<
  typeof privacyExportConversationRowSchema
>;
type PrivacyExportMessageRow = z.infer<typeof privacyExportMessageRowSchema>;
type PrivacyExportCitationRow = z.infer<typeof privacyExportCitationRowSchema>;
type PrivacyExportConsentRow = z.infer<typeof privacyExportConsentRowSchema>;

export type PrivacyExportPayload = {
  consents: Array<{
    consentType: string;
    createdAt: string;
    grantedAt: string | null;
    id: string;
    revokedAt: string | null;
    source: string | null;
    status: string;
    updatedAt: string;
  }>;
  conversations: Array<{
    createdAt: string;
    datasetVersion: string | null;
    id: string;
    lastMessageAt: string | null;
    messages: Array<{
      citations: Array<{
        citationIndex: number;
        documentId: string;
        documentName: string;
        fileId: string;
        snippet: string;
        vectorStoreId: string;
      }>;
      content: string;
      createdAt: string;
      grounded: boolean;
      id: string;
      providerMessageId: string | null;
      role: z.infer<typeof privacyExportMessageRoleSchema>;
    }>;
    status: string;
    title: string | null;
    updatedAt: string;
    vectorStoreId: string | null;
  }>;
  exportedAt: string;
  profile: {
    avatarUrl: string | null;
    createdAt: string | null;
    displayName: string | null;
    locale: string | null;
    timezone: string | null;
    updatedAt: string | null;
  };
  roles: AppRole[];
  schemaVersion: typeof PRIVACY_EXPORT_SCHEMA_VERSION;
  subject: {
    authProvider: string;
    authSubject: string;
    createdAt: string;
    email: string | null;
    emailVerifiedAt: string | null;
    id: string;
    persistedUserId: string;
    updatedAt: string;
  };
};

type PrivacyExportStoreClient = Pick<SupabaseAdminClient, "from">;

export type PrivacyExportStore = {
  exportUserData(input: {
    exportedAt?: string;
    userId: string;
  }): Promise<PrivacyExportPayload>;
};

function mapProfile(row: PrivacyExportProfileRow | null) {
  return {
    avatarUrl: row?.avatar_url ?? null,
    createdAt: row?.created_at ?? null,
    displayName: row?.display_name ?? null,
    locale: row?.locale ?? null,
    timezone: row?.timezone ?? null,
    updatedAt: row?.updated_at ?? null,
  };
}

function resolveRoleCodes(rows: PrivacyExportRoleRow[]) {
  return rows
    .map((row) => row.code)
    .filter((code): code is AppRole => isAppRole(code))
    .sort((left, right) => appRoles.indexOf(left) - appRoles.indexOf(right));
}

function groupCitationsByMessageId(rows: PrivacyExportCitationRow[]) {
  const citationsByMessageId = new Map<
    string,
    PrivacyExportPayload["conversations"][number]["messages"][number]["citations"]
  >();

  for (const citation of rows) {
    const citations = citationsByMessageId.get(citation.message_id) ?? [];

    citations.push({
      citationIndex: citation.citation_index,
      documentId: citation.document_id,
      documentName: citation.document_name,
      fileId: citation.file_id,
      snippet: citation.snippet,
      vectorStoreId: citation.vector_store_id,
    });
    citationsByMessageId.set(citation.message_id, citations);
  }

  return citationsByMessageId;
}

function groupMessagesByConversationId(
  messageRows: PrivacyExportMessageRow[],
  citationsByMessageId: ReturnType<typeof groupCitationsByMessageId>,
) {
  const messagesByConversationId = new Map<
    string,
    PrivacyExportPayload["conversations"][number]["messages"]
  >();

  for (const message of messageRows) {
    const citations = citationsByMessageId.get(message.id) ?? [];
    const messages =
      messagesByConversationId.get(message.conversation_id) ?? [];

    messages.push({
      citations,
      content: message.content,
      createdAt: message.created_at,
      grounded: citations.length > 0,
      id: message.id,
      providerMessageId: message.provider_message_id,
      role: message.role,
    });
    messagesByConversationId.set(message.conversation_id, messages);
  }

  return messagesByConversationId;
}

async function loadUser(client: PrivacyExportStoreClient, userId: string) {
  const { data, error } = await client
    .from("users")
    .select(
      "id, auth_provider, auth_subject, email, email_verified_at, created_at, updated_at",
    )
    .eq("id", userId)
    .single<PrivacyExportUserRow>();

  if (error || !data) {
    throw new Error(`Failed to load user privacy export: ${error?.message}`);
  }

  return privacyExportUserRowSchema.parse(data);
}

async function loadProfile(client: PrivacyExportStoreClient, userId: string) {
  const { data, error } = await client
    .from("profiles")
    .select(
      "display_name, avatar_url, locale, timezone, created_at, updated_at",
    )
    .eq("user_id", userId)
    .maybeSingle<PrivacyExportProfileRow>();

  if (error) {
    throw new Error(`Failed to load profile privacy export: ${error.message}`);
  }

  return data ? privacyExportProfileRowSchema.parse(data) : null;
}

async function loadRoleCodes(client: PrivacyExportStoreClient, userId: string) {
  const { data: userRoleRows, error: userRoleError } = await client
    .from("user_roles")
    .select("role_id")
    .eq("user_id", userId)
    .returns<PrivacyExportUserRoleRow[]>();

  if (userRoleError) {
    throw new Error(
      `Failed to load role privacy export: ${userRoleError.message}`,
    );
  }

  const roleIds = privacyExportUserRoleRowSchema
    .array()
    .parse(userRoleRows ?? [])
    .map((row) => row.role_id);

  if (roleIds.length === 0) {
    return [];
  }

  const { data: roleRows, error: roleError } = await client
    .from("roles")
    .select("id, code")
    .in("id", roleIds)
    .returns<PrivacyExportRoleRow[]>();

  if (roleError) {
    throw new Error(
      `Failed to resolve role privacy export: ${roleError.message}`,
    );
  }

  return resolveRoleCodes(
    privacyExportRoleRowSchema.array().parse(roleRows ?? []),
  );
}

async function loadConversations(
  client: PrivacyExportStoreClient,
  userId: string,
) {
  const { data, error } = await client
    .from("conversations")
    .select(
      "id, title, status, created_at, updated_at, last_message_at, dataset_version, vector_store_id",
    )
    .eq("user_id", userId)
    .order("last_message_at", {
      ascending: false,
      nullsFirst: false,
    })
    .order("created_at", { ascending: false })
    .returns<PrivacyExportConversationRow[]>();

  if (error) {
    throw new Error(
      `Failed to load conversation privacy export: ${error.message}`,
    );
  }

  return privacyExportConversationRowSchema.array().parse(data ?? []);
}

async function loadMessages(client: PrivacyExportStoreClient, userId: string) {
  const { data, error } = await client
    .from("messages")
    .select(
      "id, conversation_id, role, content, provider_message_id, created_at",
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .returns<PrivacyExportMessageRow[]>();

  if (error) {
    throw new Error(`Failed to load message privacy export: ${error.message}`);
  }

  return privacyExportMessageRowSchema.array().parse(data ?? []);
}

async function loadCitations(
  client: PrivacyExportStoreClient,
  messageIds: string[],
) {
  if (messageIds.length === 0) {
    return [];
  }

  const { data, error } = await client
    .from("message_citations")
    .select(
      "message_id, citation_index, document_id, document_name, snippet, file_id, vector_store_id",
    )
    .in("message_id", messageIds)
    .order("citation_index", { ascending: true })
    .returns<PrivacyExportCitationRow[]>();

  if (error) {
    throw new Error(`Failed to load citation privacy export: ${error.message}`);
  }

  return privacyExportCitationRowSchema.array().parse(data ?? []);
}

async function loadConsents(client: PrivacyExportStoreClient, userId: string) {
  const { data, error } = await client
    .from("consents")
    .select(
      "id, consent_type, status, granted_at, revoked_at, source, created_at, updated_at",
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .returns<PrivacyExportConsentRow[]>();

  if (error) {
    throw new Error(`Failed to load consent privacy export: ${error.message}`);
  }

  return privacyExportConsentRowSchema.array().parse(data ?? []);
}

export function createPrivacyExportStore(
  client: PrivacyExportStoreClient = supabaseAdmin,
): PrivacyExportStore {
  return {
    async exportUserData({ exportedAt, userId }) {
      const user = await loadUser(client, userId);
      const profile = await loadProfile(client, userId);
      const roles = await loadRoleCodes(client, userId);
      const conversations = await loadConversations(client, userId);
      const messages = await loadMessages(client, userId);
      const citations = await loadCitations(
        client,
        messages.map((message) => message.id),
      );
      const consents = await loadConsents(client, userId);
      const citationsByMessageId = groupCitationsByMessageId(citations);
      const messagesByConversationId = groupMessagesByConversationId(
        messages,
        citationsByMessageId,
      );

      return {
        schemaVersion: PRIVACY_EXPORT_SCHEMA_VERSION,
        exportedAt: exportedAt ?? new Date().toISOString(),
        subject: {
          id: buildAppUserId(user.auth_provider, user.auth_subject),
          persistedUserId: user.id,
          authProvider: user.auth_provider,
          authSubject: user.auth_subject,
          email: user.email,
          emailVerifiedAt: user.email_verified_at,
          createdAt: user.created_at,
          updatedAt: user.updated_at,
        },
        profile: mapProfile(profile),
        roles,
        conversations: conversations.map((conversation) => ({
          id: conversation.id,
          datasetVersion: conversation.dataset_version,
          title: conversation.title,
          status: conversation.status,
          createdAt: conversation.created_at,
          updatedAt: conversation.updated_at,
          lastMessageAt: conversation.last_message_at,
          vectorStoreId: conversation.vector_store_id,
          messages: messagesByConversationId.get(conversation.id) ?? [],
        })),
        consents: consents.map((consent) => ({
          id: consent.id,
          consentType: consent.consent_type,
          status: consent.status,
          grantedAt: consent.granted_at,
          revokedAt: consent.revoked_at,
          source: consent.source,
          createdAt: consent.created_at,
          updatedAt: consent.updated_at,
        })),
      };
    },
  };
}

export const privacyExportStore = createPrivacyExportStore();
