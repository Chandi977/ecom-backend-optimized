/**
 * Normalizes the admin-supplied storefront visibility map into a plain
 * `{ [key: string]: boolean }`. Anything that isn't a usable object becomes an
 * empty map (= everything visible). Only explicit `false` values are kept as
 * `false`; every other truthy/coercible value is stored as `true`, so the map
 * stays small and predictable. Keys containing `.` or `$` are dropped because
 * MongoDB cannot store them as field names inside a Mixed sub-document.
 */
export const sanitizeFieldVisibility = (
  input: unknown,
): Record<string, boolean> => {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {};

  const out: Record<string, boolean> = {};
  for (const [rawKey, rawValue] of Object.entries(input as Record<string, unknown>)) {
    const key = String(rawKey).trim();
    if (!key || key.includes('.') || key.startsWith('$')) continue;
    out[key] = rawValue !== false;
  }
  return out;
};
