import { getEncoding } from 'js-tiktoken';

export const DEFAULT_OUTPUT_TOKENS = 4000;
export const MAX_OUTPUT_TOKENS = 16000;
let encoding: ReturnType<typeof getEncoding> | undefined;
let alternateEncoding: ReturnType<typeof getEncoding> | undefined;

export function tokenCount(text: string): number {
  encoding ??= getEncoding('cl100k_base');
  return encoding.encode(text, [], []).length;
}

export function fitsBudget(text: string, maxTokens: number): boolean {
  if (Buffer.byteLength(text) > maxTokens * 8) return false;
  const framed = JSON.stringify({
    content: [{ type: 'text', text }],
    isError: false,
  });
  // Reserve space for JSON-RPC framing; clients may expose serialized content.
  const budget = maxTokens - 32;
  if (Buffer.byteLength(framed) <= budget) return true;
  if (tokenCount(framed) > budget) return false;
  alternateEncoding ??= getEncoding('o200k_base');
  return alternateEncoding.encode(framed, [], []).length <= budget;
}

export function compactJson(text: string): string {
  try {
    return JSON.stringify(JSON.parse(text));
  } catch {
    return text;
  }
}

// Count the serialized envelope too: escaping can make a preview larger than its source.
export function boundedPreview(
  text: string,
  maxTokens: number,
  envelope: (preview: string) => unknown
): string {
  let low = 0;
  let high = Math.min(text.length, maxTokens * 8);
  let bestLength = 0;
  let best = JSON.stringify(envelope(''));
  if (!fitsBudget(best, maxTokens))
    throw new Error('Output budget too small for result metadata');
  while (low <= high) {
    let end = Math.floor((low + high) / 2);
    if (end > 0 && /[\uD800-\uDBFF]/.test(text[end - 1])) end--;
    const candidate = JSON.stringify(envelope(text.slice(0, end)));
    if (fitsBudget(candidate, maxTokens)) {
      best = candidate;
      bestLength = end;
      low = Math.floor((low + high) / 2) + 1;
    } else {
      high = end - 1;
    }
  }
  if (text.length && bestLength === 0) {
    throw new Error(
      'Output budget leaves no room for content; increase maxOutputTokens or narrow selectors'
    );
  }
  return best;
}
