import "server-only";

import { createHmac } from "node:crypto";

export type LogLevel = "info" | "warn" | "error";

export interface StructuredLogEntry {
  timestamp: string;
  level: LogLevel;
  event: string;
  request_id: string;
  route: string;
  method: string;
  status_code: number;
  latency_ms: number | null;
  user_id: string | null;
  details: Record<string, unknown> | null;
}

export interface StructuredLogInput {
  event: string;
  requestId: string;
  route: string;
  method: string;
  statusCode: number;
  latencyMs: number | null;
  userId?: string | null;
  details?: Record<string, unknown> | null;
  level?: LogLevel;
  secret?: string | null;
  now?: Date;
}

export function pseudonymizeUserId(
  userId: string | null | undefined,
  secret: string | null | undefined = process.env.AUTH_SECRET,
): string | null {
  if (!userId) {
    return null;
  }

  if (!secret) {
    return "redacted";
  }

  return createHmac("sha256", secret).update(userId).digest("hex");
}

export function buildStructuredLogEntry(
  input: StructuredLogInput,
): StructuredLogEntry {
  return {
    timestamp: (input.now ?? new Date()).toISOString(),
    level: input.level ?? "info",
    event: input.event,
    request_id: input.requestId,
    route: input.route,
    method: input.method,
    status_code: input.statusCode,
    latency_ms: input.latencyMs,
    user_id: pseudonymizeUserId(input.userId, input.secret),
    details: input.details ?? null,
  };
}

export function serializeStructuredLogEntry(entry: StructuredLogEntry): string {
  return JSON.stringify(entry);
}

export function logStructuredEvent(
  input: StructuredLogInput,
): StructuredLogEntry {
  const entry = buildStructuredLogEntry(input);
  const serializedEntry = serializeStructuredLogEntry(entry);

  if (entry.level === "error") {
    console.error(serializedEntry);
  } else if (entry.level === "warn") {
    console.warn(serializedEntry);
  } else {
    console.info(serializedEntry);
  }

  return entry;
}
