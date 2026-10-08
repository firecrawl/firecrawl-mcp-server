export function normalizeHeader(
  value: string | string[] | undefined
): string | undefined {
  if (value == null) return undefined;
  const v = Array.isArray(value) ? value[0] : value;
  const trimmed = typeof v === 'string' ? v.trim() : '';
  return trimmed || undefined;
}

export function withoutTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}
