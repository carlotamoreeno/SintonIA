import { describe, expect, it } from "vitest";
import {
  buildKnowledgeDocumentVectorStoreFileAttributes,
  MAX_CUSTOM_VECTOR_STORE_FILE_ATTRIBUTES,
  MAX_VECTOR_STORE_FILE_ATTRIBUTES,
} from "./vector-store-file-attributes";

function createCatalogDocumentAttributesInput(
  overrides?: Partial<
    Parameters<typeof buildKnowledgeDocumentVectorStoreFileAttributes>[0]
  >,
) {
  return {
    customMetadata: {},
    datasetVersion: "mvp-2026-03",
    docId: "botanica-mvp-v1-corpus-mvp",
    documentVersion: 1,
    mimeType: "application/pdf",
    title: "Corpus botánico de prueba",
    ...overrides,
  };
}

describe("buildKnowledgeDocumentVectorStoreFileAttributes", () => {
  it("returns the canonical attributes when the catalog metadata is empty", () => {
    expect(
      buildKnowledgeDocumentVectorStoreFileAttributes(
        createCatalogDocumentAttributesInput(),
      ),
    ).toEqual({
      dataset_version: "mvp-2026-03",
      doc_id: "botanica-mvp-v1-corpus-mvp",
      document_version: 1,
      mime_type: "application/pdf",
      title: "Corpus botánico de prueba",
    });
  });

  it("projects only scalar custom metadata with normalized keys", () => {
    expect(
      buildKnowledgeDocumentVectorStoreFileAttributes(
        createCatalogDocumentAttributesInput({
          customMetadata: {
            AudienceLevel: "  principiantes  ",
            "Cultivation Zone": 9,
            internal: false,
            nested: {
              ignored: true,
            },
            notes: "   ",
            nullable: null,
            tags: ["interior"],
          },
        }),
      ),
    ).toEqual({
      dataset_version: "mvp-2026-03",
      doc_id: "botanica-mvp-v1-corpus-mvp",
      document_version: 1,
      mime_type: "application/pdf",
      title: "Corpus botánico de prueba",
      custom_audience_level: "principiantes",
      custom_cultivation_zone: 9,
      custom_internal: false,
    });
  });

  it("keeps the first deterministic collision and caps custom attributes at eleven", () => {
    const attributes = buildKnowledgeDocumentVectorStoreFileAttributes(
      createCatalogDocumentAttributesInput({
        customMetadata: {
          "A Value": "first collision winner",
          a_value: "second collision loser",
          b: "value-b",
          c: "value-c",
          d: "value-d",
          e: "value-e",
          f: "value-f",
          g: "value-g",
          h: "value-h",
          i: "value-i",
          j: "value-j",
          k: "value-k",
          l: "value-l",
          "***": "discarded because the key normalizes to empty",
        },
      }),
    );

    expect(Object.keys(attributes)).toHaveLength(
      MAX_VECTOR_STORE_FILE_ATTRIBUTES,
    );
    expect(
      Object.keys(attributes).filter((key) => key.startsWith("custom_")),
    ).toHaveLength(MAX_CUSTOM_VECTOR_STORE_FILE_ATTRIBUTES);
    expect(attributes.custom_a_value).toBe("first collision winner");
    expect(attributes).not.toHaveProperty("custom_l");
    expect(attributes).not.toHaveProperty("***");
  });
});
