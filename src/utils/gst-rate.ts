export const normalizeGstRate = (
  value: unknown,
  fallback: number | undefined = undefined
): number | undefined => {
  if (value === undefined || value === null || value === '') return fallback;

  const rate = Number(value);
  if (!Number.isFinite(rate) || rate < 0) return fallback;

  return rate > 0 && rate <= 1 ? rate * 100 : rate;
};

export const parseOptionalGstRate = (value: unknown): number | undefined => {
  if (value === undefined || value === null || value === '') return undefined;
  return normalizeGstRate(value);
};
