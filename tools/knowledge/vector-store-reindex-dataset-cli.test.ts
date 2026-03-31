import { describe, expect, it } from "vitest";
import { ReindexKnowledgeDatasetError } from "@/lib/knowledge/reindex-knowledge-dataset-core";
import {
  formatErrorPayload,
  parseCliArgs,
} from "./vector-store-reindex-dataset-cli";

describe("vector-store-reindex-dataset-cli", () => {
  it("parses the required dataset flag and defaults the limit", () => {
    expect(parseCliArgs(["--dataset-version", "mvp-2026-03"])).toEqual({
      datasetVersion: "mvp-2026-03",
      limit: 25,
    });
  });

  it("parses an explicit limit", () => {
    expect(
      parseCliArgs(["--dataset-version", "mvp-2026-03", "--limit", "10"]),
    ).toEqual({
      datasetVersion: "mvp-2026-03",
      limit: 10,
    });
  });

  it("formats structured dataset errors for CLI stderr output", () => {
    const error = new ReindexKnowledgeDatasetError({
      code: "vector_store_not_registered",
      message: "missing store",
      vectorStoreId: null,
    });

    expect(formatErrorPayload(error)).toEqual({
      code: "vector_store_not_registered",
      message: "missing store",
      ok: false,
      vectorStoreId: null,
    });
  });
});
