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

/** Normalizes a tool call's arguments in place against its zod object schema. */
export function normalizeToolArguments(schema: unknown, args: unknown): void {
  const def = unwrap(schema as Schema)?._zod?.def;
  if (def?.type !== 'object' || !isPlainObject(args)) return;
  normalizeObject(def.shape, args);
}
