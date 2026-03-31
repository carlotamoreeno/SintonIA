import { describe, expect, it } from "vitest";
import { AttachKnowledgeDocumentToVectorStoreError } from "@/lib/knowledge/attach-document-to-vector-store-core";
import { formatErrorPayload, parseCliArgs } from "./vector-store-attach-cli";

describe("vector-store-attach-cli", () => {
  it("parses the required CLI flags", () => {
    expect(
      parseCliArgs([
        "--dataset-version",
        "mvp-2026-03",
        "--doc-id",
        "botanica-mvp-v1-corpus-mvp",
        "--document-version",
        "1",
      ]),
    ).toEqual({
      datasetVersion: "mvp-2026-03",
      docId: "botanica-mvp-v1-corpus-mvp",
      documentVersion: 1,
    });
  });

  it("formats structured service errors for CLI stderr output", () => {
    const error = new AttachKnowledgeDocumentToVectorStoreError({
      code: "catalog_record_failed",
      message: "catalog failed",
      openAIFileId: "file_123",
      vectorStoreFileId: "file_123",
      vectorStoreId: "vs_123",
    });

    expect(formatErrorPayload(error)).toEqual({
      code: "catalog_record_failed",
      message: "catalog failed",
      ok: false,
      openAIFileId: "file_123",
      vectorStoreFileId: "file_123",
      vectorStoreId: "vs_123",
    });
  });
});
