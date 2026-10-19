/**
 * Normalizes argument shapes agents commonly send before schema validation,
 * in place: an optional field sent as null is dropped, a numeric string in a
 * number field becomes a number, and a format or parser object the API accepts
 * ({type: 'markdown'}, {type: 'json', schema}) becomes the tool's own form.
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
  const def = unwrap(schema)?._zod?.def;
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
