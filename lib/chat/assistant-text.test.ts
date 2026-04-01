import { describe, expect, it } from "vitest";
import {
  CHAT_RESPONSE_TRUNCATED_NOTICE,
  appendTruncationNotice,
  getSanitizedDeltaFromSnapshot,
  mergeAssistantTexts,
  sanitizeAssistantText,
} from "./assistant-text";

describe("sanitizeAssistantText", () => {
  it("removes complete provider file citation markers", () => {
    expect(
      sanitizeAssistantText(
        "Riego y el estado de la planta. fileciteturn0file8turn0file9",
      ),
    ).toBe("Riego y el estado de la planta.");
  });

  it("removes trailing partial provider markers while streaming", () => {
    expect(sanitizeAssistantText("Respuesta parcial fileciteturn0fi")).toBe(
      "Respuesta parcial",
    );
  });

  it("removes private delimiters left behind by the provider", () => {
    expect(sanitizeAssistantText("Texto suelto con ruido")).toBe(
      "Texto suelto con ruido",
    );
  });
});

describe("getSanitizedDeltaFromSnapshot", () => {
  it("emits only the newly visible suffix from a cleaned snapshot", () => {
    expect(
      getSanitizedDeltaFromSnapshot(
        "Riego y estado ",
        "Riego y estado de la planta. fileciteturn0file8",
      ),
    ).toEqual({
      delta: "de la planta.",
      nextVisibleText: "Riego y estado de la planta.",
    });
  });
});

describe("mergeAssistantTexts", () => {
  it("deduplicates overlap between a partial response and its continuation", () => {
    expect(
      mergeAssistantTexts(
        "Riego moderado y luz indirecta.",
        "luz indirecta. Añade drenaje.",
      ),
    ).toBe("Riego moderado y luz indirecta. Añade drenaje.");
  });

  it("appends a paragraph break when there is no overlap", () => {
    expect(mergeAssistantTexts("Bloque uno.", "Bloque dos.")).toBe(
      "Bloque uno. Bloque dos.",
    );
  });
});

describe("appendTruncationNotice", () => {
  it("appends the truncation notice once", () => {
    expect(appendTruncationNotice("Respuesta.")).toBe(
      `Respuesta.${CHAT_RESPONSE_TRUNCATED_NOTICE}`,
    );
    expect(
      appendTruncationNotice(`Respuesta.${CHAT_RESPONSE_TRUNCATED_NOTICE}`),
    ).toBe(`Respuesta.${CHAT_RESPONSE_TRUNCATED_NOTICE}`);
  });
});
