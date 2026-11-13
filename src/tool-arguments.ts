import { z } from 'zod';

/**
 * Normalizes argument shapes agents commonly send before schema validation,
 * in place: an optional field sent as null is dropped, a numeric string in a
 * number field becomes a number, and a format or parser object the API accepts
 * ({type: 'markdown'}, {type: 'json', schema}) becomes the tool's own form,
 * and an `httpUrl()` field sent without a scheme gets `https://`.
 * Validation still runs afterwards, so bounds and enums are unchanged.
 */

type Schema = {
  _zod?: { def?: Record<string, any> };
  safeParse?: (value: unknown) => { success: boolean };
};

const WRAPPER_TYPES = new Set([
  'optional',
  'default',
  'prefault',
  'nullable',
  'readonly',
  'catch',
  'nonoptional',
]);

const NUMERIC_STRING = /^-?\d+(?:\.\d+)?$/;
const URL_SCHEME = /^[a-z][a-z0-9+.-]*:\/\//i;
const HTTP_SCHEME = /^(https?:)\/*/i;
const HTTP_URL_FIELDS = new WeakSet<object>();

function isHttpUrl(value: string): boolean {
  try {
    const { protocol } = new URL(value);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * A page URL field advertised as a plain string, so clients that strip
 * schemes from full URLs can send `example.com/page`. Do not wrap it in
 * `.describe()`: the normalizer recognizes this exact instance.
 */
export function httpUrl() {
  const schema = z.string().trim().refine(isHttpUrl, 'Invalid URL');
  HTTP_URL_FIELDS.add(schema);
  return schema;
}

// Option-bearing objects keyed by the list they appear in, mapped to the
// sibling field this server carries those options in.
const OPTION_FIELDS: Record<string, Record<string, string>> = {
  formats: {
    json: 'jsonOptions',
    query: 'queryOptions',
    screenshot: 'screenshotOptions',
  },
  parsers: { pdf: 'pdfOptions' },
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function unwrap(schema: Schema | undefined): Schema | undefined {
  let current = schema;
  while (current?._zod?.def && WRAPPER_TYPES.has(current._zod.def.type)) {
    current = current._zod.def.innerType;
  }
  return current;
}

function accepts(schema: Schema, value: unknown): boolean {
  try {
    return schema.safeParse?.(value).success ?? false;
  } catch {
    return false;
  }
}

function liftTypedObjects(
  value: Record<string, unknown>,
  shape: Record<string, Schema>
): void {
  for (const [listKey, optionFields] of Object.entries(OPTION_FIELDS)) {
    const list = value[listKey];
    if (!(listKey in shape) || !Array.isArray(list)) continue;
    value[listKey] = list.map((item) => {
      if (!isPlainObject(item) || typeof item.type !== 'string') return item;
      const { type, ...options } = item;
      if (Object.keys(options).length === 0) return type;
      const optionsKey = optionFields[type];
      if (!optionsKey || value[optionsKey] != null) return item;
      const optionsShape = unwrap(shape[optionsKey])?._zod?.def?.shape;
      if (
        !optionsShape ||
        Object.keys(options).some((key) => !(key in optionsShape))
      ) {
        return item;
      }
      value[optionsKey] = options;
      return type;
    });
  }
}

function normalizeObject(
  shape: Record<string, Schema>,
  value: Record<string, unknown>
): void {
  liftTypedObjects(value, shape);
  for (const [key, field] of Object.entries(shape)) {
    if (!(key in value)) continue;
    if (value[key] === null) {
      if (!accepts(field, null) && accepts(field, undefined)) delete value[key];
      continue;
    }
    value[key] = normalizeValue(field, value[key]);
  }
}

function normalizeValue(schema: Schema, value: unknown): unknown {
  const inner = unwrap(schema);
  if (inner && HTTP_URL_FIELDS.has(inner) && typeof value === 'string') {
    const url = value.trim();
    if (HTTP_SCHEME.test(url)) return url.replace(HTTP_SCHEME, '$1//');
    if (!url || URL_SCHEME.test(url) || /^\/(?!\/)/.test(url)) return value;
    return `https://${url.replace(/^\/\//, '')}`;
  }
  const def = inner?._zod?.def;
  if (!def) return value;
  if (
    def.type === 'number' &&
    typeof value === 'string' &&
    NUMERIC_STRING.test(value.trim())
  ) {
    return Number(value);
  }
  if (def.type === 'array' && Array.isArray(value)) {
    return value.map((item) => normalizeValue(def.element, item));
  }
  if (def.type === 'object' && isPlainObject(value)) {
    normalizeObject(def.shape, value);
  }
  return value;
}

// Fields that agents carry over from an earlier tool definition or from
// another Firecrawl tool. Calls shaped that way keep working: the field is
// still dropped without an error, but only at the places it was accepted.
const CARRIED_FIELDS = new Set(['objective', 'clientModel', 'conversationId', 'sessionId']);

/** `keys` is the field's path through the arguments, without array indexes. */
function isCarriedField(tool: string, keys: string[]): boolean {
  const key = keys[keys.length - 1];
  if (keys.length === 1) {
    return CARRIED_FIELDS.has(key) || (key === 'actions' && tool === 'firecrawl_scrape');
  }
  const parent = keys[keys.length - 2];
  return (
    (key === 'actions' && parent === 'scrapeOptions') ||
    (key === 'saveChanges' && parent === 'profile')
  );
}

/** An argument field the tool's schema does not define. */
export type UnknownArgument = {
  /** Dotted path of the field, such as `maxage` or `location.city`. */
  path: string;
  /** A declared field that differs only in letter case, such as `maxAge`. */
  suggestion?: string;
};

function collectUnknown(
  tool: string,
  schema: Schema | undefined,
  value: unknown,
  keys: string[],
  path: string,
  found: UnknownArgument[]
): void {
  const def = unwrap(schema)?._zod?.def;
  if (!def) return;
  if (def.type === 'array' && Array.isArray(value)) {
    value.forEach((item, i) => collectUnknown(tool, def.element, item, keys, `${path}[${i}]`, found));
    return;
  }
  if (def.type === 'union') {
    // The value is read as the first option it fits, so report the option
    // with the fewest unknown fields, and nothing if one option takes it all.
    const kind = Array.isArray(value) ? 'array' : isPlainObject(value) ? 'object' : undefined;
    let best: UnknownArgument[] | undefined;
    for (const option of (kind ? def.options : []) as Schema[]) {
      if (unwrap(option)?._zod?.def?.type !== kind) continue;
      const candidate: UnknownArgument[] = [];
      collectUnknown(tool, option, value, keys, path, candidate);
      if (!best || candidate.length < best.length) best = candidate;
    }
    found.push(...(best ?? []));
    return;
  }
  if (def.type !== 'object' || !isPlainObject(value)) return;
  const shape = def.shape as Record<string, Schema>;
  // A catchall means the object already decides about extra keys itself:
  // strict objects reject them and loose objects keep them.
  const strips = def.catchall === undefined;
  for (const [key, child] of Object.entries(value)) {
    const fieldPath = path ? `${path}.${key}` : key;
    const fieldKeys = [...keys, key];
    if (Object.hasOwn(shape, key)) {
      collectUnknown(tool, shape[key], child, fieldKeys, fieldPath, found);
    } else if (strips && !isCarriedField(tool, fieldKeys)) {
      const suggestion = Object.keys(shape).find(
        (name) => name.toLowerCase() === key.toLowerCase()
      );
      found.push({ path: fieldPath, ...(suggestion ? { suggestion } : {}) });
    }
  }
}

/**
 * Argument fields that the tool's zod schema would silently strip. The listed
 * input schema says `additionalProperties: false`, so these are refused
 * instead of dropped. Record-typed maps are left open.
 */
export function unknownArguments(schema: unknown, args: unknown, tool = ''): UnknownArgument[] {
  const found: UnknownArgument[] = [];
  collectUnknown(tool, schema as Schema, args, [], '', found);
  return found;
}

/** Normalizes a tool call's arguments in place against its zod object schema. */
export function normalizeToolArguments(schema: unknown, args: unknown): void {
  const def = unwrap(schema as Schema)?._zod?.def;
  if (def?.type !== 'object' || !isPlainObject(args)) return;
  normalizeObject(def.shape, args);
}
