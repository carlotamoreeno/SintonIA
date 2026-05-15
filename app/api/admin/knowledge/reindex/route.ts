import { NextResponse } from "next/server";
import { z } from "zod";
import { UNAUTHENTICATED_API_MESSAGE } from "@/lib/auth/access";
import { canAccessDocumentaryAdmin } from "@/lib/auth/admin-access";
import { getOptionalAppSession } from "@/lib/auth/app-session";
import {
  ReindexKnowledgeDocumentError,
  reindexKnowledgeDocument,
} from "@/lib/knowledge/reindex-knowledge-document";

export const dynamic = "force-dynamic";

const INVALID_ADMIN_KNOWLEDGE_REINDEX_MESSAGE = "Invalid request payload";
const FORBIDDEN_ADMIN_KNOWLEDGE_REINDEX_MESSAGE = "Forbidden";
const CONFLICT_ADMIN_KNOWLEDGE_REINDEX_MESSAGE =
  "Knowledge document cannot be reindexed";
const UPSTREAM_ADMIN_KNOWLEDGE_REINDEX_MESSAGE = "Document reindex failed";

const reindexRequestSchema = z.object({
  datasetVersion: z.string().trim().min(1),
  docId: z.string().trim().min(1),
  documentVersion: z.number().int().positive(),
});

async function readJson(request: Request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

function formatZodIssues(error: z.ZodError) {
  return error.issues.reduce<Record<string, string[]>>((issues, issue) => {
    const field = issue.path[0];
    const key = typeof field === "string" ? field : "body";

    issues[key] = [...(issues[key] ?? []), issue.message];

    return issues;
  }, {});
}

function invalidRequestResponse(issues: Record<string, string[]>) {
  return NextResponse.json(
    {
      issues,
      message: INVALID_ADMIN_KNOWLEDGE_REINDEX_MESSAGE,
    },
    { status: 400 },
  );
}

function getReindexErrorStatus(error: ReindexKnowledgeDocumentError) {
  switch (error.code) {
    case "document_not_found":
    case "document_not_uploaded":
    case "document_retired":
    case "vector_store_not_registered":
      return 409;
    case "catalog_record_failed":
    case "openai_vector_store_file_delete_failed":
    case "openai_vector_store_file_lookup_failed":
    case "reindex_attach_failed":
      return 502;
  }
}

function getReindexErrorMessage(error: ReindexKnowledgeDocumentError) {
  switch (getReindexErrorStatus(error)) {
    case 409:
      return CONFLICT_ADMIN_KNOWLEDGE_REINDEX_MESSAGE;
    default:
      return UPSTREAM_ADMIN_KNOWLEDGE_REINDEX_MESSAGE;
  }
}

export async function POST(request: Request) {
  const appSession = await getOptionalAppSession();

  if (!appSession?.session.user) {
    return NextResponse.json(
      {
        message: UNAUTHENTICATED_API_MESSAGE,
      },
      { status: 401 },
    );
  }

  if (!canAccessDocumentaryAdmin(appSession.session.user.role)) {
    return NextResponse.json(
      {
        message: FORBIDDEN_ADMIN_KNOWLEDGE_REINDEX_MESSAGE,
      },
      { status: 403 },
    );
  }

  const body = await readJson(request);

  if (!body) {
    return invalidRequestResponse({
      body: ["Expected JSON body."],
    });
  }

  const parsedBody = reindexRequestSchema.safeParse(body);

  if (!parsedBody.success) {
    return invalidRequestResponse(formatZodIssues(parsedBody.error));
  }

  try {
    const result = await reindexKnowledgeDocument(parsedBody.data);

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    if (error instanceof ReindexKnowledgeDocumentError) {
      const status = getReindexErrorStatus(error);

      return NextResponse.json(
        {
          code: error.code,
          message: getReindexErrorMessage(error),
        },
        { status },
      );
    }

    return NextResponse.json(
      {
        message: UPSTREAM_ADMIN_KNOWLEDGE_REINDEX_MESSAGE,
      },
      { status: 502 },
    );
  }
}
