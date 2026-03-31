import { describe, expect, it } from "vitest";
import { ReindexKnowledgeDocumentError } from "@/lib/knowledge/reindex-knowledge-document-core";
import {
  formatErrorPayload,
  parseCliArgs,
} from "./vector-store-reindex-document-cli";

describe("vector-store-reindex-document-cli", () => {
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
    const error = new ReindexKnowledgeDocumentError({
      code: "reindex_attach_failed",
      message: "attach failed",
      openAIFileId: "file_123",
      vectorStoreId: "vs_123",
    });

    expect(formatErrorPayload(error)).toEqual({
      code: "reindex_attach_failed",
      message: "attach failed",
      ok: false,
      openAIFileId: "file_123",
      vectorStoreId: "vs_123",
    });
  });
});
