const DEFAULT_GST_RATE = 18;

export const normalizeGstRate = (
  value: unknown,
  fallback: number | undefined = DEFAULT_GST_RATE
): number | undefined => {
  if (value === undefined || value === null || value === '') return fallback;

  const rate = Number(value);
  if (!Number.isFinite(rate) || rate < 0) return fallback;

  return rate > 0 && rate <= 1 ? rate * 100 : rate;
};

// Returns undefined for "not provided" inputs so callers can distinguish
// "leave the GST rate unchanged" from an explicit rate. The empty check lives
// here rather than delegating an `undefined` fallback to normalizeGstRate,
// because passing `undefined` would trigger that function's default parameter
// and coerce the result back to the default rate.
export const parseOptionalGstRate = (value: unknown): number | undefined => {
  if (value === undefined || value === null || value === '') return undefined;
  return normalizeGstRate(value);
};

export const getDefaultGstRate = (): number => DEFAULT_GST_RATE;
