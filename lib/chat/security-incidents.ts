import "server-only";

import { logStructuredEvent } from "@/lib/observability/logger";
import type {
  ChatInputGuardrailDecision,
  ChatRiskSeverity,
} from "./input-guardrails";
import type { ChatOutputGuardrailDecision } from "./output-guardrails";

export const CHAT_GUARDRAIL_INCIDENT_EVENT = "chat_guardrail_incident";

export type ChatGuardrailIncidentAction = "blocked" | "mitigated";
export type ChatGuardrailTransport = "json" | "sse";

type ChatGuardrailDecision =
  | ChatInputGuardrailDecision
  | ChatOutputGuardrailDecision;

type ReportableChatGuardrailDecision = ChatGuardrailDecision & {
  category: string;
  reason: string;
  severity: Exclude<ChatRiskSeverity, "low">;
};

export type ChatGuardrailIncidentDetails = {
  action: ChatGuardrailIncidentAction;
  activation_point: "input" | "output";
  category: string;
  reason: string;
  severity: Exclude<ChatRiskSeverity, "low">;
  transport: ChatGuardrailTransport;
};

export type LogChatGuardrailIncidentInput = {
  action: ChatGuardrailIncidentAction;
  decision: ChatGuardrailDecision | null;
  latencyMs?: number | null;
  method?: string;
  now?: Date;
  requestId: string | null | undefined;
  route?: string;
  secret?: string | null;
  statusCode: number;
  transport: ChatGuardrailTransport;
  userId: string | null | undefined;
};

function isReportableSeverity(
  severity: ChatRiskSeverity | null,
): severity is Exclude<ChatRiskSeverity, "low"> {
  return severity === "medium" || severity === "high";
}

function isReportableDecision(
  decision: ChatGuardrailDecision | null,
): decision is ReportableChatGuardrailDecision {
  return (
    decision !== null &&
    decision.category !== null &&
    decision.reason !== null &&
    isReportableSeverity(decision.severity)
  );
}

export function buildChatGuardrailIncidentDetails({
  action,
  decision,
  transport,
}: Pick<
  LogChatGuardrailIncidentInput,
  "action" | "decision" | "transport"
>): ChatGuardrailIncidentDetails | null {
  if (!isReportableDecision(decision)) {
    return null;
  }

  return {
    action,
    activation_point: decision.activationPoint,
    category: decision.category,
    reason: decision.reason,
    severity: decision.severity,
    transport,
  };
}

export function logChatGuardrailIncident(input: LogChatGuardrailIncidentInput) {
  const details = buildChatGuardrailIncidentDetails(input);

  if (!details || !input.requestId) {
    return null;
  }

  return logStructuredEvent({
    details,
    event: CHAT_GUARDRAIL_INCIDENT_EVENT,
    latencyMs: input.latencyMs ?? null,
    level: "warn",
    method: input.method ?? "POST",
    now: input.now,
    requestId: input.requestId,
    route: input.route ?? "/api/chat",
    secret: input.secret,
    statusCode: input.statusCode,
    userId: input.userId,
  });
}
