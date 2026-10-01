export interface SourcePreference {
  id: string;
  tools: string[] | null;
}
export interface Preferences {
  version: 1;
  completed: boolean;
  sources: SourcePreference[];
}
export const preferencesKey = 'firecrawl.provider-onboarding.v1';
const empty = (): Preferences => ({
  version: 1,
  completed: false,
  sources: [],
});

export function parsePreferences(raw: string | null): Preferences {
  try {
    const value = JSON.parse(raw ?? 'null');
    if (
      value?.version !== 1 ||
      typeof value.completed !== 'boolean' ||
      !Array.isArray(value.sources) ||
      value.sources.length > 100
    )
      return empty();
    const seen = new Set<string>();
    const sources: SourcePreference[] = [];
    for (const source of value.sources) {
      if (
        !source ||
        typeof source.id !== 'string' ||
        !source.id ||
        source.id.length > 256 ||
        seen.has(source.id) ||
        !(
          source.tools === null ||
          (Array.isArray(source.tools) &&
            source.tools.length > 0 &&
            source.tools.length <= 100 &&
            source.tools.every(
              (tool: unknown) =>
                typeof tool === 'string' &&
                tool.length > 0 &&
                tool.length <= 256
            ))
        )
      )
        return empty();
      seen.add(source.id);
      sources.push({
        id: source.id,
        tools:
          source.tools === null ? null : [...new Set<string>(source.tools)],
      });
    }
    return { version: 1, completed: value.completed, sources };
  } catch {
    return empty();
  }
}

export function preferenceStore(
  storage: Pick<Storage, 'getItem' | 'setItem'> | undefined
) {
  let value = empty();
  let persistent = false;
  try {
    if (storage) {
      value = parsePreferences(storage.getItem(preferencesKey));
      // Reading may work while writes are blocked by the host or browser.
      storage.setItem(preferencesKey, JSON.stringify(value));
      persistent = true;
    }
  } catch {
    /* Keep an in-memory draft when storage is unavailable. */
  }
  return {
    read: () => structuredClone(value),
    persistent: () => persistent,
    write(next: Preferences) {
      value = parsePreferences(JSON.stringify(next));
      try {
        storage?.setItem(preferencesKey, JSON.stringify(value));
      } catch {
        persistent = false;
      }
    },
  };
}
