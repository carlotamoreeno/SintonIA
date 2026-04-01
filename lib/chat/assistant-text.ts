const COMPLETE_FILE_CITATION_PATTERN = /filecite(?:[^\n]+)+/g;
const TRAILING_FILE_CITATION_PATTERN = /filecite(?:[^\n]*)?$/g;
const TRAILING_PRIVATE_DELIMITERS_PATTERN = /[]+$/g;
const PRIVATE_DELIMITERS_PATTERN = /[]/g;

export const CHAT_RESPONSE_TRUNCATED_CONTINUATION_PROMPT =
  "Continúa exactamente desde donde se cortó la respuesta anterior. No repitas contenido ya dado. Mantén el mismo idioma, el mismo tono y el mismo markdown ligero cuando ayude a la legibilidad.";

export const CHAT_RESPONSE_TRUNCATED_NOTICE =
  '\n\nNota: la respuesta sigue truncada por límite de salida. Puedes pedir "continúa" para seguir.';

function trimLineTrailingWhitespace(text: string) {
  return text
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/g, ""))
    .join("\n");
}

export function sanitizeAssistantText(text: string) {
  return trimLineTrailingWhitespace(
    text
      .replace(/\r\n?/g, "\n")
      .replace(COMPLETE_FILE_CITATION_PATTERN, "")
      .replace(TRAILING_FILE_CITATION_PATTERN, "")
      .replace(TRAILING_PRIVATE_DELIMITERS_PATTERN, "")
      .replace(PRIVATE_DELIMITERS_PATTERN, ""),
  );
}

export function getCommonPrefixLength(left: string, right: string) {
  const maxLength = Math.min(left.length, right.length);
  let index = 0;

  while (index < maxLength && left[index] === right[index]) {
    index += 1;
  }

  return index;
}

export function getSanitizedDeltaFromSnapshot(
  previousVisibleText: string,
  rawSnapshot: string,
) {
  const nextVisibleText = sanitizeAssistantText(rawSnapshot);
  const commonPrefixLength = getCommonPrefixLength(
    previousVisibleText,
    nextVisibleText,
  );

  return {
    delta: nextVisibleText.slice(commonPrefixLength),
    nextVisibleText,
  };
}

export function mergeAssistantTexts(
  baseText: string,
  continuationText: string,
) {
  if (baseText.length === 0) {
    return continuationText;
  }

  if (continuationText.length === 0) {
    return baseText;
  }

  if (continuationText.startsWith(baseText)) {
    return continuationText;
  }

  if (baseText.endsWith(continuationText)) {
    return baseText;
  }

  const maxOverlap = Math.min(baseText.length, continuationText.length, 1200);

  for (let overlapLength = maxOverlap; overlapLength > 0; overlapLength -= 1) {
    if (
      baseText.slice(-overlapLength) ===
      continuationText.slice(0, overlapLength)
    ) {
      return `${baseText}${continuationText.slice(overlapLength)}`;
    }
  }

  if (/^\s/u.test(continuationText) || baseText.endsWith("\n")) {
    return `${baseText}${continuationText}`;
  }

  const normalizedContinuationText = continuationText.trimStart();

  if (/^(?:[-*•]\s|\d+[.)]\s)/u.test(normalizedContinuationText)) {
    return `${baseText}\n\n${normalizedContinuationText}`;
  }

  return `${baseText} ${normalizedContinuationText}`;
}

export function appendTruncationNotice(text: string) {
  if (text.endsWith(CHAT_RESPONSE_TRUNCATED_NOTICE)) {
    return text;
  }

  return `${text}${CHAT_RESPONSE_TRUNCATED_NOTICE}`;
}
