import type {
  ChatInputRiskCategory,
  ChatRiskSeverity,
} from "./input-guardrails";

export const MITIGATED_CHAT_OUTPUT_MESSAGE =
  "No puedo ofrecer esa respuesta. Mantengamos la conversación dentro de SintonIA y con información segura y autorizada.";

export type ChatOutputRiskCategory = ChatInputRiskCategory;

export type ChatOutputGuardrailDecision =
  | {
      activationPoint: "output";
      category: ChatOutputRiskCategory;
      mitigated: true;
      reason: string;
      severity: ChatRiskSeverity;
    }
  | {
      activationPoint: "output";
      category: null;
      mitigated: false;
      reason: null;
      severity: null;
    };

const CONTROL_BYPASS_OUTPUT_PATTERNS: Array<{
  pattern: RegExp;
  reason: string;
}> = [
  {
    pattern:
      /\b(system|developer|hidden|internal)\b.{0,40}\b(prompt|instructions?|message)\b.{0,24}\b(is|are|:)/u,
    reason: "hidden_prompt_disclosure",
  },
  {
    pattern:
      /\b(prompt|instrucciones?|mensaje)\b.{0,24}\b(sistema|desarrollador|intern[oa]s?|ocult[oa]s?)\b.{0,24}\b(es|son|:)/u,
    reason: "hidden_prompt_disclosure",
  },
  {
    pattern:
      /\b(sure|of course|claro|por supuesto)\b.{0,72}\b(ignore|override|bypass|jailbreak|ignorar|anular|saltarme)\b.{0,64}\b(system|developer|instructions?|reglas|instrucciones?)\b/u,
    reason: "role_or_instruction_override",
  },
];

const PRIVACY_EXFILTRATION_OUTPUT_PATTERNS: Array<{
  pattern: RegExp;
  reason: string;
}> = [
  {
    pattern: /\bsk-[a-z0-9_-]{10,}\b/u,
    reason: "secret_or_credential_disclosure",
  },
  {
    pattern:
      /\b(api[_ -]?key|token|password|credential|secret|clave api|contrasena|credencial|secreto)\b.{0,16}[:=]\s*["']?[a-z0-9_-]{12,}/u,
    reason: "secret_or_credential_disclosure",
  },
  {
    pattern:
      /\b(here (is|are)|aqui tienes|estas son|este es)\b.{0,48}\b(api keys?|tokens?|passwords?|credentials?|secrets?|claves? api|contrasenas?|credenciales?|secretos?)\b.{0,24}\b(is|are|es|son|:)/u,
    reason: "secret_or_credential_disclosure",
  },
];

const SENSITIVE_GUIDANCE_OUTPUT_PATTERNS: Array<{
  pattern: RegExp;
  reason: string;
  severity: Extract<ChatRiskSeverity, "high" | "medium">;
}> = [
  {
    pattern:
      /\b(step 1|first|paso 1|primero)\b.{0,80}\b(bomb|explosive|molotov|poison|ricin|malware|ransomware|phishing|bomba|explosiv[oa]|veneno|ricina)\b/u,
    reason: "explicit_harmful_instructions",
    severity: "high",
  },
  {
    pattern:
      /\b(mix|combine|connect|run|execute|deploy|install|mezcla|combina|conecta|ejecuta|instala)\b.{0,80}\b(bomb|explosive|molotov|poison|ricin|malware|ransomware|phishing|bomba|explosiv[oa]|veneno|ricina)\b/u,
    reason: "explicit_harmful_instructions",
    severity: "high",
  },
  {
    pattern:
      /\b(take|toma|administra)\s+\d+\s?(mg|ml|pills?|tablets?|pastillas?|comprimidos?)\b/u,
    reason: "sensitive_high_impact_advice",
    severity: "medium",
  },
];

const SCOPE_DRIFT_OUTPUT_PATTERNS: Array<{
  pattern: RegExp;
  reason: string;
}> = [
  {
    pattern:
      /\b(here is a poem|here's a poem|aqui tienes un poema|aqui va un poema)\b/u,
    reason: "generic_chat_output",
  },
  {
    pattern:
      /\b(ingredients:|ingredientes:|preparation:|preparacion:)\b.{0,120}\b(recipe|receta)\b/u,
    reason: "generic_chat_output",
  },
  {
    pattern:
      /\b(here is a joke|here's a joke|aqui tienes un chiste|aqui va un chiste)\b/u,
    reason: "generic_chat_output",
  },
];

function normalizeChatOutput(output: string) {
  return output
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function firstMatchingPattern(
  normalizedOutput: string,
  patterns: Array<{ pattern: RegExp; reason: string }>,
) {
  return patterns.find(({ pattern }) => pattern.test(normalizedOutput)) ?? null;
}

export function classifyChatOutputRisk(
  output: string,
): ChatOutputGuardrailDecision {
  const normalizedOutput = normalizeChatOutput(output);

  const controlBypassMatch = firstMatchingPattern(
    normalizedOutput,
    CONTROL_BYPASS_OUTPUT_PATTERNS,
  );

  if (controlBypassMatch) {
    return {
      activationPoint: "output",
      category: "control_bypass",
      mitigated: true,
      reason: controlBypassMatch.reason,
      severity: "high",
    };
  }

  const privacyExfiltrationMatch = firstMatchingPattern(
    normalizedOutput,
    PRIVACY_EXFILTRATION_OUTPUT_PATTERNS,
  );

  if (privacyExfiltrationMatch) {
    return {
      activationPoint: "output",
      category: "privacy_exfiltration",
      mitigated: true,
      reason: privacyExfiltrationMatch.reason,
      severity: "high",
    };
  }

  for (const sensitiveGuidancePattern of SENSITIVE_GUIDANCE_OUTPUT_PATTERNS) {
    if (sensitiveGuidancePattern.pattern.test(normalizedOutput)) {
      return {
        activationPoint: "output",
        category: "sensitive_guidance",
        mitigated: true,
        reason: sensitiveGuidancePattern.reason,
        severity: sensitiveGuidancePattern.severity,
      };
    }
  }

  const scopeDriftMatch = firstMatchingPattern(
    normalizedOutput,
    SCOPE_DRIFT_OUTPUT_PATTERNS,
  );

  if (scopeDriftMatch) {
    return {
      activationPoint: "output",
      category: "scope_drift",
      mitigated: true,
      reason: scopeDriftMatch.reason,
      severity: "low",
    };
  }

  return {
    activationPoint: "output",
    category: null,
    mitigated: false,
    reason: null,
    severity: null,
  };
}
