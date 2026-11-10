/**
 * Shared `_meta` entries for tool definitions.
 */

/**
 * Largest tool result, in characters, that Claude Code keeps inline for the
 * tools marked with {@link LARGE_RESULT_META}. Claude Code otherwise saves any
 * result over 50,000 characters to a file and shows the model an
 * error-prefixed stub. Claude Code accepts values up to 500,000.
 */
export const MAX_RESULT_SIZE_CHARS = 150_000;

/** `_meta` for tools whose results can carry large page or document text. */
export const LARGE_RESULT_META = {
  'anthropic/maxResultSizeChars': MAX_RESULT_SIZE_CHARS,
} as const;
