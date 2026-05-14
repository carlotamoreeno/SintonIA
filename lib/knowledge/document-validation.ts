import "server-only";

import { z } from "zod";
import {
  knowledgeDocumentCandidateSchema,
  knowledgeDocumentMetadataSchema,
  KNOWLEDGE_DOCUMENT_ALLOWED_MIME_TYPES,
  MAX_KNOWLEDGE_DOCUMENT_SIZE_BYTES,
} from "./document-metadata";
import {
  knowledgeDocumentCatalogStore,
  type ExistingKnowledgeDocument,
  type KnowledgeDocumentCatalogStore,
} from "@/lib/supabase/knowledge-document-store";

export {
  knowledgeDocumentCandidateSchema,
  knowledgeDocumentMetadataSchema,
  KNOWLEDGE_DOCUMENT_ALLOWED_MIME_TYPES,
  MAX_KNOWLEDGE_DOCUMENT_SIZE_BYTES,
};

const sha256Pattern = /^[a-f0-9]{64}$/;

export type KnowledgeDocumentCandidateInput = z.input<
  typeof knowledgeDocumentCandidateSchema
>;

export type ValidatedKnowledgeDocumentCandidate = z.output<
  typeof knowledgeDocumentCandidateSchema
>;

type KnowledgeDocumentDuplicateLookupStore = Pick<
  KnowledgeDocumentCatalogStore,
  "findFirstDocumentBySha256"
>;

export type KnowledgeDocumentValidationErrorCode =
  | "duplicate_sha256"
  | "file_too_large"
  | "invalid_mime_type"
  | "invalid_sha256"
  | "missing_required_metadata";

type KnowledgeDocumentValidationErrorDetails =
  | {
      allowedMimeTypes: readonly string[];
      receivedMimeType: string;
    }
  | {
      fields: string[];
    }
  | {
      maxSizeBytes: number;
      sizeBytes: number;
    }
  | {
      sha256: string;
    };

type KnowledgeDocumentValidationErrorInput = {
  cause?: unknown;
  code: KnowledgeDocumentValidationErrorCode;
  details?: KnowledgeDocumentValidationErrorDetails;
  duplicate?: ExistingKnowledgeDocument | null;
  message: string;
};

export class KnowledgeDocumentValidationError extends Error {
  override readonly cause: unknown;
  readonly code: KnowledgeDocumentValidationErrorCode;
  readonly details: KnowledgeDocumentValidationErrorDetails | undefined;
  readonly duplicate: ExistingKnowledgeDocument | null | undefined;

  constructor(input: KnowledgeDocumentValidationErrorInput) {
    super(input.message);
    this.name = "KnowledgeDocumentValidationError";
    this.code = input.code;
    this.details = input.details;
    this.duplicate = input.duplicate;
    this.cause = input.cause;
  }
}

function toMissingRequiredMetadataError(error: z.ZodError) {
  const fields = [...new Set(error.issues.flatMap((issue) => issue.path))].map(
    (field) => String(field),
  );

  return new KnowledgeDocumentValidationError({
    cause: error,
    code: "missing_required_metadata",
    details: {
      fields,
    },
    message: `Knowledge document metadata is incomplete or invalid: ${fields.join(", ")}.`,
  });
}

function isAllowedKnowledgeDocumentMimeType(mimeType: string) {
  return KNOWLEDGE_DOCUMENT_ALLOWED_MIME_TYPES.includes(
    mimeType as (typeof KNOWLEDGE_DOCUMENT_ALLOWED_MIME_TYPES)[number],
  );
}

export async function validateKnowledgeDocumentCandidate(
  input: KnowledgeDocumentCandidateInput,
  store: KnowledgeDocumentDuplicateLookupStore = knowledgeDocumentCatalogStore,
): Promise<ValidatedKnowledgeDocumentCandidate> {
  let candidate: ValidatedKnowledgeDocumentCandidate;

  try {
    candidate = knowledgeDocumentCandidateSchema.parse(input);
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw toMissingRequiredMetadataError(error);
    }

    throw error;
  }

  if (!isAllowedKnowledgeDocumentMimeType(candidate.mimeType)) {
    throw new KnowledgeDocumentValidationError({
      code: "invalid_mime_type",
      details: {
        allowedMimeTypes: KNOWLEDGE_DOCUMENT_ALLOWED_MIME_TYPES,
        receivedMimeType: candidate.mimeType,
      },
      message: `Unsupported knowledge document MIME type: ${candidate.mimeType}.`,
    });
  }

  if (candidate.sizeBytes > MAX_KNOWLEDGE_DOCUMENT_SIZE_BYTES) {
    throw new KnowledgeDocumentValidationError({
      code: "file_too_large",
      details: {
        maxSizeBytes: MAX_KNOWLEDGE_DOCUMENT_SIZE_BYTES,
        sizeBytes: candidate.sizeBytes,
      },
      message: `Knowledge document exceeds the ${MAX_KNOWLEDGE_DOCUMENT_SIZE_BYTES} byte size limit.`,
    });
  }

  if (!sha256Pattern.test(candidate.sha256)) {
    throw new KnowledgeDocumentValidationError({
      code: "invalid_sha256",
      details: {
        sha256: candidate.sha256,
      },
      message:
        "Knowledge document sha256 must be a 64-character hexadecimal string.",
    });
  }

  const duplicate = await store.findFirstDocumentBySha256(candidate.sha256);

  if (duplicate) {
    throw new KnowledgeDocumentValidationError({
      code: "duplicate_sha256",
      duplicate,
      message:
        "A knowledge document with the same sha256 already exists in the catalog.",
    });
  }

  return candidate;
}
