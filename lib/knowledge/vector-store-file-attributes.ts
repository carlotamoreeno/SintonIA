import type { KnowledgeDocumentCatalogDocument } from "@/lib/supabase/knowledge-document-store-core";

export const MAX_VECTOR_STORE_FILE_ATTRIBUTES = 16;
export const CANONICAL_VECTOR_STORE_FILE_ATTRIBUTE_KEYS = [
  "dataset_version",
  "doc_id",
  "document_version",
  "mime_type",
  "title",
] as const;
export const MAX_CUSTOM_VECTOR_STORE_FILE_ATTRIBUTES =
  MAX_VECTOR_STORE_FILE_ATTRIBUTES -
  CANONICAL_VECTOR_STORE_FILE_ATTRIBUTE_KEYS.length;

export type VectorStoreFileAttributeValue = string | number | boolean;
export type KnowledgeDocumentVectorStoreFileAttributes = Record<
  string,
  VectorStoreFileAttributeValue
>;

type KnowledgeDocumentVectorStoreFileAttributeInput = Pick<
  KnowledgeDocumentCatalogDocument,
  | "customMetadata"
  | "datasetVersion"
  | "docId"
  | "documentVersion"
  | "mimeType"
  | "title"
>;

type CandidateCustomAttribute = {
  normalizedKey: string;
  normalizedSourceKey: string;
  sourceKey: string;
  value: VectorStoreFileAttributeValue;
};

function compareStrings(left: string, right: string) {
  if (left < right) {
    return -1;
  }

  if (left > right) {
    return 1;
  }

  return 0;
}

function normalizeCustomAttributeKey(sourceKey: string) {
  const normalizedBaseKey = sourceKey
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();

  if (normalizedBaseKey.length === 0) {
    return null;
  }

  return `custom_${normalizedBaseKey}`;
}

function normalizeCustomAttributeValue(
  value: unknown,
): VectorStoreFileAttributeValue | null {
  if (typeof value === "string") {
    const trimmedValue = value.trim();

    return trimmedValue.length > 0 ? trimmedValue : null;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === "boolean") {
    return value;
  }

  return null;
}

function toCandidateCustomAttribute(
  sourceKey: string,
  value: unknown,
): CandidateCustomAttribute | null {
  const normalizedKey = normalizeCustomAttributeKey(sourceKey);
  const normalizedValue = normalizeCustomAttributeValue(value);

  if (!normalizedKey || normalizedValue === null) {
    return null;
  }

  return {
    normalizedKey,
    normalizedSourceKey: sourceKey.trim().toLowerCase(),
    sourceKey,
    value: normalizedValue,
  };
}

function compareCandidateCustomAttributes(
  left: CandidateCustomAttribute,
  right: CandidateCustomAttribute,
) {
  return (
    compareStrings(left.normalizedKey, right.normalizedKey) ||
    compareStrings(left.normalizedSourceKey, right.normalizedSourceKey) ||
    compareStrings(left.sourceKey, right.sourceKey)
  );
}

function buildCustomVectorStoreFileAttributes(
  input: KnowledgeDocumentVectorStoreFileAttributeInput,
) {
  const customAttributes: KnowledgeDocumentVectorStoreFileAttributes = {};
  const candidates = Object.entries(input.customMetadata)
    .map(([sourceKey, value]) => toCandidateCustomAttribute(sourceKey, value))
    .filter(
      (candidate): candidate is CandidateCustomAttribute => candidate !== null,
    )
    .sort(compareCandidateCustomAttributes);

  for (const candidate of candidates) {
    if (candidate.normalizedKey in customAttributes) {
      continue;
    }

    customAttributes[candidate.normalizedKey] = candidate.value;

    if (
      Object.keys(customAttributes).length >=
      MAX_CUSTOM_VECTOR_STORE_FILE_ATTRIBUTES
    ) {
      break;
    }
  }

  return customAttributes;
}

export function buildKnowledgeDocumentVectorStoreFileAttributes(
  input: KnowledgeDocumentVectorStoreFileAttributeInput,
): KnowledgeDocumentVectorStoreFileAttributes {
  return {
    dataset_version: input.datasetVersion,
    doc_id: input.docId,
    document_version: input.documentVersion,
    mime_type: input.mimeType,
    title: input.title,
    ...buildCustomVectorStoreFileAttributes(input),
  };
}
