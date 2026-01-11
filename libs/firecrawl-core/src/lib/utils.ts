export function removeEmptyTopLevel<T extends Record<string, unknown>>(obj: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined) continue;
    if (v === null) continue;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      const keys = Object.keys(v as any);
      if (keys.length === 0) continue;
    }
    out[k] = v;
  }
  return out as T;
}

export function asPrettyJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}
