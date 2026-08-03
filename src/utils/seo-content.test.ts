import { sanitizeSeoContent, hasSeoContent } from './seo-content';

describe('sanitizeSeoContent', () => {
  it('returns an empty block for non-object input', () => {
    expect(sanitizeSeoContent(undefined)).toEqual({});
    expect(sanitizeSeoContent(null)).toEqual({});
    expect(sanitizeSeoContent('corrugated boxes')).toEqual({});
    expect(sanitizeSeoContent([{ question: 'q', answer: 'a' }])).toEqual({});
  });

  it('keeps trimmed heading, description and FAQ pairs', () => {
    expect(
      sanitizeSeoContent({
        heading: '  About Corrugated Boxes  ',
        description: '  Strong 3-ply boxes.  ',
        faqs: [{ question: ' What ply? ', answer: ' 3-ply for e-commerce. ' }],
      }),
    ).toEqual({
      heading: 'About Corrugated Boxes',
      description: 'Strong 3-ply boxes.',
      faqs: [{ question: 'What ply?', answer: '3-ply for e-commerce.' }],
    });
  });

  it('omits blank fields instead of storing empty strings', () => {
    expect(sanitizeSeoContent({ heading: '   ', description: '', faqs: [] })).toEqual({});
  });

  it('drops FAQ rows missing either side, and malformed rows', () => {
    const result = sanitizeSeoContent({
      description: 'Copy',
      faqs: [
        { question: 'Kept?', answer: 'Yes' },
        { question: 'No answer', answer: '   ' },
        { question: '', answer: 'No question' },
        'not-an-object',
        null,
      ],
    });
    expect(result.faqs).toEqual([{ question: 'Kept?', answer: 'Yes' }]);
  });

  it('normalizes CRLF line endings so paragraph splitting stays predictable', () => {
    expect(sanitizeSeoContent({ description: 'One\r\n\r\nTwo' }).description).toBe('One\n\nTwo');
  });

  it('caps FAQ count and field lengths', () => {
    const faqs = Array.from({ length: 40 }, (_, i) => ({ question: `q${i}`, answer: `a${i}` }));
    expect(sanitizeSeoContent({ faqs }).faqs).toHaveLength(30);
    expect(sanitizeSeoContent({ heading: 'x'.repeat(500) }).heading).toHaveLength(160);
    expect(sanitizeSeoContent({ description: 'x'.repeat(30000) }).description).toHaveLength(20000);
  });
});

describe('hasSeoContent', () => {
  it('is false for empty, missing or non-object blocks', () => {
    expect(hasSeoContent(undefined)).toBe(false);
    expect(hasSeoContent({})).toBe(false);
    expect(hasSeoContent({ heading: 'About Boxes' })).toBe(false);
    expect(hasSeoContent({ description: '   ' })).toBe(false);
    expect(hasSeoContent({ faqs: [] })).toBe(false);
  });

  it('is true when there is a description or at least one FAQ', () => {
    expect(hasSeoContent({ description: 'Copy' })).toBe(true);
    expect(hasSeoContent({ faqs: [{ question: 'q', answer: 'a' }] })).toBe(true);
  });
});
