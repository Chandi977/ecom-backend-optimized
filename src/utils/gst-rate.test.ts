import { normalizeGstRate, parseOptionalGstRate } from './gst-rate';

describe('normalizeGstRate', () => {
  it('returns undefined for empty values', () => {
    expect(normalizeGstRate(undefined)).toBeUndefined();
    expect(normalizeGstRate(null)).toBeUndefined();
    expect(normalizeGstRate('')).toBeUndefined();
  });

  it('passes through whole-number percentages', () => {
    expect(normalizeGstRate(5)).toBe(5);
    expect(normalizeGstRate(12)).toBe(12);
    expect(normalizeGstRate('28')).toBe(28);
  });

  it('treats values in (0, 1] as ratios and scales them to percent', () => {
    expect(normalizeGstRate(0.18)).toBe(18);
    expect(normalizeGstRate(0.05)).toBeCloseTo(5);
    expect(normalizeGstRate(1)).toBe(100);
  });

  it('falls back for invalid or negative values', () => {
    expect(normalizeGstRate('abc')).toBeUndefined();
    expect(normalizeGstRate(-5)).toBeUndefined();
    expect(normalizeGstRate(Number.NaN)).toBeUndefined();
  });

  it('honours a custom numeric fallback for empty or invalid values', () => {
    expect(normalizeGstRate(undefined, 5)).toBe(5);
    expect(normalizeGstRate('', 7)).toBe(7);
    expect(normalizeGstRate('not-a-number', 9)).toBe(9);
  });
});

describe('parseOptionalGstRate', () => {
  it('returns undefined for empty values', () => {
    expect(parseOptionalGstRate(undefined)).toBeUndefined();
    expect(parseOptionalGstRate('')).toBeUndefined();
  });

  it('normalizes provided values', () => {
    expect(parseOptionalGstRate(12)).toBe(12);
    expect(parseOptionalGstRate(0.12)).toBe(12);
  });
});

