export const BLOCKED_CHAT_INPUT_MESSAGE =
  "No puedo procesar esa solicitud porque incumple las reglas de seguridad de SintonIA.";

export type ChatInputRiskCategory =
  | "control_bypass"
  | "privacy_exfiltration"
  | "scope_drift"
  | "sensitive_guidance";

export type ChatRiskSeverity = "high" | "low" | "medium";

export type ChatInputGuardrailDecision =
  | {
      activationPoint: "input";
      blocked: true;
      category: Exclude<ChatInputRiskCategory, "scope_drift">;
      reason: string;
      severity: Exclude<ChatRiskSeverity, "low">;
    }
  | {
      activationPoint: "input";
      blocked: false;
      category: "scope_drift";
      reason: string;
      severity: "low";
    }
  | {
      activationPoint: "input";
      blocked: false;
      category: null;
      reason: null;
      severity: null;
    };

const CONTROL_BYPASS_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  {
    pattern:
      /\b(ignore|disregard|forget|override)\b.{0,48}\b(previous|prior|system|developer|all)\b.{0,32}\b(instructions?|rules?|messages?|prompt)\b/u,
    reason: "role_or_instruction_override",
  },
  {
    pattern:
      /\b(olvida|ignora|anula|omite|desactiva|sobrescribe)\b.{0,56}\b(instrucciones?|reglas?|prompt|sistema|desarrollador)\b/u,
    reason: "role_or_instruction_override",
  },
  {
    pattern:
      /\b(reveal|show|print|dump|expose)\b.{0,40}\b(system|developer|hidden|internal)\b.{0,24}\b(prompt|instructions?|message)\b/u,
    reason: "hidden_prompt_extraction",
  },
  {
    pattern:
      /\b(muestra|revela|imprime|ensename|expone)\b.{0,48}\b(prompt|instrucciones?|mensaje)\b.{0,24}\b(sistema|desarrollador|intern[oa]s?|ocult[oa]s?)\b/u,
    reason: "hidden_prompt_extraction",
  },
  {
    pattern:
      /\b(jailbreak|dan mode|modo dan|bypass safeguards?|bypass safety|saltate las reglas)\b/u,
    reason: "explicit_control_bypass",
  },
];

const PRIVACY_EXFILTRATION_PATTERNS: Array<{
  pattern: RegExp;
  reason: string;
}> = [
  {
    pattern:
      /\b(show|reveal|print|dump|extract|leak|list|give me)\b.{0,48}\b(api keys?|tokens?|passwords?|credentials?|secrets?)\b/u,
    reason: "secret_or_credential_exfiltration",
  },
  {
    pattern:
      /\b(muestra|revela|imprime|extrae|filtra|lista|dame|dime)\b.{0,56}\b(api keys?|claves? api|tokens?|contrasenas?|credenciales?|secretos?)\b/u,
    reason: "secret_or_credential_exfiltration",
  },
  {
    pattern:
      /\b(show|reveal|export|dump|list|give me)\b.{0,56}\b(other users?|all users?|customer data|personal data|emails?)\b/u,
    reason: "unauthorized_personal_data_request",
  },
  {
    pattern:
      /\b(muestra|revela|exporta|extrae|lista|dame)\b.{0,56}\b(otros usuarios|todos los usuarios|datos personales|emails?|correos)\b/u,
    reason: "unauthorized_personal_data_request",
  },
];

const SENSITIVE_GUIDANCE_PATTERNS: Array<{
  pattern: RegExp;
  reason: string;
  severity: "high" | "medium";
}> = [
  {
    pattern:
      /\b(how to|steps? to|instructions? to|guide to|make|build|create)\b.{0,64}\b(bomb|explosive|molotov|poison|ricin|malware|ransomware|phishing kit)\b/u,
    reason: "explicit_harmful_instructions",
    severity: "high",
  },
  {
    pattern:
      /\b(como|pasos?|instrucciones?|guia|fabricar|crear|hacer|preparar)\b.{0,72}\b(bomba|explosiv[oa]|molotov|veneno|ricina|malware|ransomware|phishing)\b/u,
    reason: "explicit_harmful_instructions",
    severity: "high",
  },
  {
    pattern:
      /\b(hack|steal|crack|bypass)\b.{0,48}\b(account|password|wifi|2fa|mfa|payment|bank)\b/u,
    reason: "explicit_abuse_instructions",
    severity: "high",
  },
  {
    pattern:
      /\b(hackear|robar|crackear|evadir|saltarse)\b.{0,56}\b(cuenta|contrasena|wifi|2fa|mfa|pago|banco)\b/u,
    reason: "explicit_abuse_instructions",
    severity: "high",
  },
  {
    pattern:
      /\b(diagnose|prescribe|dosage|medical treatment|legal advice|investment advice)\b/u,
    reason: "sensitive_high_impact_advice",
    severity: "medium",
  },
  {
    pattern:
      /\b(diagnostica|receta|prescribe|dosis|tratamiento medico|asesoria legal|consejo de inversion)\b/u,
    reason: "sensitive_high_impact_advice",
    severity: "medium",
  },
];

const SCOPE_DRIFT_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  {
    pattern:
      /\b(write|draft|compose|create)\b.{0,32}\b(poem|song|recipe|joke|cover letter)\b/u,
    reason: "generic_chat_request",
  },
  {
    pattern:
      /\b(escribe|redacta|crea|haz)\b.{0,40}\b(poema|cancion|receta|chiste|carta de presentacion)\b/u,
    reason: "generic_chat_request",
  },
  {
    pattern: /\b(capital of|who won|weather in|translate this)\b/u,
    reason: "out_of_product_scope",
  },
  {
    pattern: /\b(capital de|quien gano|clima en|traduce esto)\b/u,
    reason: "out_of_product_scope",
  },
];

function normalizeChatInput(input: string) {
  return input
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function firstMatchingPattern(
  normalizedInput: string,
  patterns: Array<{ pattern: RegExp; reason: string }>,
) {
  return patterns.find(({ pattern }) => pattern.test(normalizedInput)) ?? null;
}

export function classifyChatInputRisk(
  input: string,
): ChatInputGuardrailDecision {
  const normalizedInput = normalizeChatInput(input);

  const controlBypassMatch = firstMatchingPattern(
    normalizedInput,
    CONTROL_BYPASS_PATTERNS,
  );

  if (controlBypassMatch) {
    return {
      activationPoint: "input",
      blocked: true,
      category: "control_bypass",
      reason: controlBypassMatch.reason,
      severity: "high",
    };
  }

  const privacyExfiltrationMatch = firstMatchingPattern(
    normalizedInput,
    PRIVACY_EXFILTRATION_PATTERNS,
  );

  if (privacyExfiltrationMatch) {
    return {
      activationPoint: "input",
      blocked: true,
      category: "privacy_exfiltration",
      reason: privacyExfiltrationMatch.reason,
      severity: "high",
    };
  }

  for (const sensitiveGuidancePattern of SENSITIVE_GUIDANCE_PATTERNS) {
    if (sensitiveGuidancePattern.pattern.test(normalizedInput)) {
      return {
        activationPoint: "input",
        blocked: true,
        category: "sensitive_guidance",
        reason: sensitiveGuidancePattern.reason,
        severity: sensitiveGuidancePattern.severity,
      };
    }
  }

  const scopeDriftMatch = firstMatchingPattern(
    normalizedInput,
    SCOPE_DRIFT_PATTERNS,
  );

  if (scopeDriftMatch) {
    return {
      activationPoint: "input",
      blocked: false,
      category: "scope_drift",
      reason: scopeDriftMatch.reason,
      severity: "low",
    };
  }

  return {
    activationPoint: "input",
    blocked: false,
    category: null,
    reason: null,
    severity: null,
  };
}
