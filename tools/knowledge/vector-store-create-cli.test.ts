import { describe, expect, it } from "vitest";
import { CreateOrRegisterVectorStoreForDatasetError } from "@/lib/knowledge/create-vector-store-for-dataset-core";
import { formatErrorPayload, parseCliArgs } from "./vector-store-create-cli";

describe("vector-store-create-cli", () => {
  it("parses the required and optional CLI flags", () => {
    expect(
      parseCliArgs([
        "--dataset-version",
        "mvp-2026-03",
        "--existing-vector-store-id",
        "vs_123",
        "--name",
        "Vector Store MVP",
      ]),
    ).toEqual({
      datasetVersion: "mvp-2026-03",
      existingVectorStoreId: "vs_123",
      name: "Vector Store MVP",
    });
  });

  it("formats structured service errors for CLI stderr output", () => {
    const error = new CreateOrRegisterVectorStoreForDatasetError({
      code: "registry_record_failed",
      message: "registry failed",
      vectorStoreId: "vs_123",
    });

    expect(formatErrorPayload(error)).toEqual({
      code: "registry_record_failed",
      message: "registry failed",
      ok: false,
      vectorStoreId: "vs_123",
    });
  });
});
