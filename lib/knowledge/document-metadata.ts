import { z } from "zod";

export const KNOWLEDGE_DOCUMENT_ALLOWED_MIME_TYPES = [
  "application/pdf",
] as const;
export const MAX_KNOWLEDGE_DOCUMENT_SIZE_BYTES = 50 * 1024 * 1024;

export const knowledgeDocumentMetadataSchema = z.object({
  datasetVersion: z.string().trim().min(1),
  docId: z.string().trim().min(1),
  mimeType: z
    .string()
    .trim()
    .min(1)
    .transform((value) => value.toLowerCase()),
  originalFilename: z.string().trim().min(1),
  sha256: z
    .string()
    .trim()
    .min(1)
    .transform((value) => value.toLowerCase()),
  title: z.string().trim().min(1),
});

export const knowledgeDocumentCandidateSchema =
  knowledgeDocumentMetadataSchema.extend({
    sizeBytes: z.number().int().nonnegative(),
  });
