/** API response metadata; never infer hints from scraped page contents. */
export function readAgentHints(value: unknown): string[] | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const hints = (value as { agent_hints?: unknown }).agent_hints;
  return Array.isArray(hints) && hints.every((hint) => typeof hint === 'string')
    ? hints
    : undefined;
}

/** Retain outer-envelope hints when an API result is flattened. */
export function preserveAgentHints(data: unknown, envelope: unknown): unknown {
  const hints = readAgentHints(envelope);
  if (!hints) return data;
  return data && typeof data === 'object' && !Array.isArray(data)
    ? { ...data, agent_hints: hints }
    : { data, agent_hints: hints };
}

export type ApiToolResult =
  | string
  | {
      content: { type: 'text'; text: string }[];
      structuredContent: Record<string, unknown>;
      isError?: boolean;
    };

export function agentHintsText(hints: string[]): string {
  return `Firecrawl API agent_hints (response guidance, separate from page content):\n${JSON.stringify(hints, null, 2)}`;
}

/**
 * JSON results already expose hints to text-only clients. Make the metadata
 * available to structured-result clients without duplicating large documents.
 * If a caller displays raw page text, put guidance in a separate text block
 * rather than appending it to the source. Existing output is unchanged when
 * the API sends no valid hints.
 */
export function formatApiResult(data: unknown, rawText?: string): ApiToolResult {
  const text = rawText ?? JSON.stringify(data, null, 2);
  const hints = readAgentHints(data);
  if (!hints) return text;
  return {
    content: [
      { type: 'text', text },
      ...(rawText !== undefined && hints.length
        ? [{ type: 'text' as const, text: agentHintsText(hints) }]
        : []),
    ],
    // Preserve the original text result and expose only the added metadata.
    // Repeating full documents here would double large JSON responses and
    // bypass the deliberate text limits of readable research tools.
    structuredContent: { agent_hints: hints },
    ...((data as { success?: unknown }).success === false
      ? { isError: true }
      : {}),
  };
}

/** SDK errors carry hints directly; raw SDK HTTP errors retain the envelope. */
export function readErrorAgentHints(error: unknown): string[] | undefined {
  const hints = readAgentHints(error);
  if (hints) return hints;
  if (!error || typeof error !== 'object') return undefined;
  const response = (error as { response?: { data?: unknown } }).response;
  return readAgentHints(response?.data);
}
