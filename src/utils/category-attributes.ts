import { ISpecSchemaField } from '../types';

/**
 * Category-level attribute inheritance helpers.
 *
 * A category (and optionally a sub-category) declares:
 *  - `common_attributes`: a free-form key -> value map of category-wide attribute
 *    defaults (e.g. hsn_code, material, print) that every product inherits unless
 *    it sets its own value. This removes the need to repeat a category-constant
 *    attribute on every product document.
 *  - `spec_schema`: the spec fields the category uses, each with a label, input
 *    type, options, unit and an optional default_value. This replaces the
 *    previously hard-coded admin/frontend specification definitions.
 *
 * Inheritance is resolved at response-assembly time (see flattenProductCatalog),
 * filling only the fields a product left blank — explicit per-product values
 * always win, and the flat catalog-filter fields stay valid.
 */

export const SPEC_FIELD_TYPES = ['number', 'select', 'text'] as const;
export type SpecFieldType = (typeof SPEC_FIELD_TYPES)[number];

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

/**
 * Normalizes a free-form key -> value attribute map. Drops keys MongoDB cannot
 * store inside a Mixed sub-document (those containing `.` or starting with `$`)
 * and skips empty values so they never overwrite something inherited downstream.
 */
export const sanitizeCommonAttributes = (input: unknown): Record<string, unknown> => {
  if (!isPlainObject(input)) return {};
  const out: Record<string, unknown> = {};
  for (const [rawKey, value] of Object.entries(input)) {
    const key = String(rawKey).trim();
    if (!key || key.includes('.') || key.startsWith('$')) continue;
    if (value === undefined || value === null || value === '') continue;
    out[key] = value;
  }
  return out;
};

const normalizeSpecType = (value: unknown): SpecFieldType => {
  const type = String(value ?? '').trim().toLowerCase();
  return (SPEC_FIELD_TYPES as readonly string[]).includes(type)
    ? (type as SpecFieldType)
    : 'text';
};

/**
 * Normalizes the admin-supplied spec-field schema into a clean, storable array.
 * Every entry needs a usable `key`; `label` falls back to the key. `options` are
 * only kept for `select` fields. Duplicate keys and malformed rows are dropped.
 */
export const sanitizeSpecSchema = (input: unknown): ISpecSchemaField[] => {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const out: ISpecSchemaField[] = [];
  for (const raw of input) {
    if (!isPlainObject(raw)) continue;
    const key = String(raw.key ?? '').trim();
    if (!key || key.includes('.') || key.startsWith('$') || seen.has(key)) continue;
    seen.add(key);

    const type = normalizeSpecType(raw.type);
    const field: ISpecSchemaField = {
      key,
      label: String(raw.label ?? key).trim() || key,
      type,
    };
    if (type === 'select' && Array.isArray(raw.options)) {
      const options = raw.options.map((option) => String(option).trim()).filter(Boolean);
      if (options.length) field.options = options;
    }
    if (raw.required !== undefined) field.required = Boolean(raw.required);
    if (raw.unit !== undefined && String(raw.unit).trim()) field.unit = String(raw.unit).trim();
    if (raw.default_value !== undefined && raw.default_value !== null && raw.default_value !== '') {
      field.default_value = raw.default_value;
    }
    out.push(field);
  }
  return out;
};
