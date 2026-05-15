import { NextResponse } from "next/server";
import { UNAUTHENTICATED_API_MESSAGE } from "@/lib/auth/access";
import { canAccessDocumentaryAdmin } from "@/lib/auth/admin-access";
import { getOptionalAppSession } from "@/lib/auth/app-session";
import {
  AdminKnowledgeDocumentUploadError,
  uploadAdminKnowledgeDocument,
} from "@/lib/knowledge/admin-document-upload";

export const dynamic = "force-dynamic";

const INVALID_ADMIN_KNOWLEDGE_UPLOAD_MESSAGE = "Invalid request payload";
const FORBIDDEN_ADMIN_KNOWLEDGE_UPLOAD_MESSAGE = "Forbidden";
const CONFLICT_ADMIN_KNOWLEDGE_UPLOAD_MESSAGE =
  "Knowledge document already exists";
const UPSTREAM_ADMIN_KNOWLEDGE_UPLOAD_MESSAGE = "Document upload failed";

function getStringFormValue(formData: FormData, field: string) {
  const value = formData.get(field);

  return typeof value === "string" ? value : null;
}

function getDocumentVersion(formData: FormData) {
  const value = getStringFormValue(formData, "documentVersion");

  if (!value) {
    return Number.NaN;
  }

  return Number(value);
}

function getFileFormValue(formData: FormData) {
  const value = formData.get("file");

  return value instanceof Blob ? value : null;
}

async function readFormData(request: Request) {
  try {
    return await request.formData();
  } catch {
    return null;
  }
}

function invalidRequestResponse(issues: Record<string, string[]>) {
  return NextResponse.json(
    {
      issues,
      message: INVALID_ADMIN_KNOWLEDGE_UPLOAD_MESSAGE,
    },
    { status: 400 },
  );
}

function getUploadErrorStatus(error: AdminKnowledgeDocumentUploadError) {
  switch (error.code) {
    case "catalog_conflict":
    case "duplicate_sha256":
      return 409;
    case "invalid_file":
    case "invalid_path_segment":
    case "invalid_request":
      return 400;
    case "catalog_insert_failed":
    case "openai_upload_failed":
    case "storage_cleanup_failed":
    case "storage_upload_failed":
    case "vector_store_attach_failed":
      return 502;
  }
}

function getUploadErrorMessage(error: AdminKnowledgeDocumentUploadError) {
  switch (getUploadErrorStatus(error)) {
    case 400:
      return INVALID_ADMIN_KNOWLEDGE_UPLOAD_MESSAGE;
    case 409:
      return CONFLICT_ADMIN_KNOWLEDGE_UPLOAD_MESSAGE;
    default:
      return UPSTREAM_ADMIN_KNOWLEDGE_UPLOAD_MESSAGE;
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
        message: FORBIDDEN_ADMIN_KNOWLEDGE_UPLOAD_MESSAGE,
      },
      { status: 403 },
    );
  }

  const formData = await readFormData(request);

  if (!formData) {
    return invalidRequestResponse({
      form: ["Expected multipart form data."],
    });
  }

  const datasetVersion = getStringFormValue(formData, "datasetVersion");
  const docId = getStringFormValue(formData, "docId");
  const documentVersion = getDocumentVersion(formData);
  const title = getStringFormValue(formData, "title");
  const file = getFileFormValue(formData);

  if (!datasetVersion || !docId || !title || !file) {
    return invalidRequestResponse({
      datasetVersion: datasetVersion ? [] : ["Required."],
      docId: docId ? [] : ["Required."],
      file: file ? [] : ["Required."],
      title: title ? [] : ["Required."],
    });
  }

  try {
    const result = await uploadAdminKnowledgeDocument({
      datasetVersion,
      docId,
      documentVersion,
      file,
      title,
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof AdminKnowledgeDocumentUploadError) {
      const status = getUploadErrorStatus(error);

      return NextResponse.json(
        {
          code: error.code,
          message: getUploadErrorMessage(error),
        },
        { status },
      );
    }

    return NextResponse.json(
      {
        message: UPSTREAM_ADMIN_KNOWLEDGE_UPLOAD_MESSAGE,
      },
      { status: 502 },
    );
  }
}
