import { NextResponse } from "next/server";
import { z } from "zod";
import { UNAUTHENTICATED_API_MESSAGE } from "@/lib/auth/access";
import { canAccessDocumentaryAdmin } from "@/lib/auth/admin-access";
import { getOptionalAppSession } from "@/lib/auth/app-session";
import {
  ActivateKnowledgeDatasetError,
  activateKnowledgeDataset,
} from "@/lib/knowledge/activate-dataset";

export const dynamic = "force-dynamic";

const INVALID_ADMIN_DATASET_ACTIVATION_MESSAGE = "Invalid request payload";
const FORBIDDEN_ADMIN_DATASET_ACTIVATION_MESSAGE = "Forbidden";
const CONFLICT_ADMIN_DATASET_ACTIVATION_MESSAGE =
  "Knowledge dataset cannot be activated";
const UPSTREAM_ADMIN_DATASET_ACTIVATION_MESSAGE = "Dataset activation failed";

const activateDatasetRequestSchema = z.object({
  datasetVersion: z.string().trim().min(1),
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
      message: INVALID_ADMIN_DATASET_ACTIVATION_MESSAGE,
    },
    { status: 400 },
  );
}

function getActivationErrorStatus(error: ActivateKnowledgeDatasetError) {
  switch (error.code) {
    case "vector_store_not_registered":
      return 409;
    case "activation_record_failed":
    case "vector_store_lookup_failed":
    case "vector_store_not_ready":
      return 502;
  }
}

function getActivationErrorMessage(error: ActivateKnowledgeDatasetError) {
  switch (getActivationErrorStatus(error)) {
    case 409:
      return CONFLICT_ADMIN_DATASET_ACTIVATION_MESSAGE;
    default:
      return UPSTREAM_ADMIN_DATASET_ACTIVATION_MESSAGE;
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
        message: FORBIDDEN_ADMIN_DATASET_ACTIVATION_MESSAGE,
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

  const parsedBody = activateDatasetRequestSchema.safeParse(body);

  if (!parsedBody.success) {
    return invalidRequestResponse(formatZodIssues(parsedBody.error));
  }

  try {
    const result = await activateKnowledgeDataset({
      activatedByUserId: appSession.persistedIdentity.user.id,
      datasetVersion: parsedBody.data.datasetVersion,
    });

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    if (error instanceof ActivateKnowledgeDatasetError) {
      const status = getActivationErrorStatus(error);

      return NextResponse.json(
        {
          code: error.code,
          message: getActivationErrorMessage(error),
        },
        { status },
      );
    }

    return NextResponse.json(
      {
        message: UPSTREAM_ADMIN_DATASET_ACTIVATION_MESSAGE,
      },
      { status: 502 },
    );
  }
}
