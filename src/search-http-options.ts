const SEARCH_TRANSPORT_MARGIN_MS = 5_000;

export function searchHttpOptions(timeout?: number) {
  return typeof timeout === 'number'
    ? { timeoutMs: timeout + SEARCH_TRANSPORT_MARGIN_MS }
    : {};
}
