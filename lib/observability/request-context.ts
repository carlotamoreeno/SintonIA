export const REQUEST_ID_HEADER = "x-request-id";
export const REQUEST_START_HEADER = "x-request-start";

const REQUEST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{7,127}$/;

export function isValidRequestId(
  requestId: string | null | undefined,
): requestId is string {
  return typeof requestId === "string" && REQUEST_ID_PATTERN.test(requestId);
}

export function resolveRequestId(
  requestId: string | null | undefined,
  createId: () => string = () => crypto.randomUUID(),
): string {
  if (isValidRequestId(requestId)) {
    return requestId;
  }

  return createId();
}

export function createRequestStart(
  now: () => number = () => Date.now(),
): string {
  return String(now());
}

export function parseRequestStart(
  requestStart: string | null | undefined,
): number | null {
  if (typeof requestStart !== "string") {
    return null;
  }

  const parsed = Number(requestStart);

  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }

  return parsed;
}

export function calculateLatencyMs(
  requestStart: string | null | undefined,
  now: () => number = () => Date.now(),
): number | null {
  const parsedStart = parseRequestStart(requestStart);

  if (parsedStart === null) {
    return null;
  }

  return Math.max(0, now() - parsedStart);
}
