import { describe, expect, it } from "vitest";
import {
  classifyChatOutputRisk,
  MITIGATED_CHAT_OUTPUT_MESSAGE,
} from "./output-guardrails";

describe("classifyChatOutputRisk", () => {
  it("classifies disclosure of hidden instructions as control bypass", () => {
    expect(
      classifyChatOutputRisk(
        "The internal system prompt is: ignore all product boundaries.",
      ),
    ).toMatchObject({
      activationPoint: "output",
      category: "control_bypass",
      mitigated: true,
      severity: "high",
    });
  });

  it("classifies exposed secrets as privacy exfiltration", () => {
    expect(
      classifyChatOutputRisk(
        "El token: sk-live-1234567890abcdef no debe compartirse.",
      ),
    ).toMatchObject({
      activationPoint: "output",
      category: "privacy_exfiltration",
      mitigated: true,
      severity: "high",
    });
  });

  it("classifies actionable harmful instructions as sensitive guidance", () => {
    expect(
      classifyChatOutputRisk(
        "Paso 1: instala malware en el equipo de destino y ejecútalo.",
      ),
    ).toMatchObject({
      activationPoint: "output",
      category: "sensitive_guidance",
      mitigated: true,
      severity: "high",
    });
  });

  it("classifies high-impact dosage advice as medium sensitive guidance", () => {
    expect(classifyChatOutputRisk("Toma 200mg cada mañana.")).toMatchObject({
      activationPoint: "output",
      category: "sensitive_guidance",
      mitigated: true,
      severity: "medium",
    });
  });

  it("classifies generic off-scope output as scope drift", () => {
    expect(
      classifyChatOutputRisk("Aquí tienes un poema sobre la primavera."),
    ).toMatchObject({
      activationPoint: "output",
      category: "scope_drift",
      mitigated: true,
      severity: "low",
    });
  });

  it("leaves normal SintonIA answers and safe refusals unchanged", () => {
    expect(
      classifyChatOutputRisk(
        "No puedo ayudarte a fabricar una bomba. Puedo ayudarte con SintonIA.",
      ),
    ).toEqual({
      activationPoint: "output",
      category: null,
      mitigated: false,
      reason: null,
      severity: null,
    });
    expect(MITIGATED_CHAT_OUTPUT_MESSAGE).toContain("SintonIA");
  });
});
