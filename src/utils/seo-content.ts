/**
 * Sub-category SEO content ("category copy") helpers.
 *
 * A sub-category carries one block of long-form copy + a FAQ list that every
 * product page in that sub-category renders. Authoring it once per sub-category
 * (e.g. "Corrugated Boxes") gives each of its products indexable, keyword-rich
 * body text and an FAQPage schema without duplicating the copy per product.
 *
 * Everything is stored as PLAIN TEXT, never HTML: the storefront renders blank
 * lines as paragraphs and `- ` prefixed lines as bullets, so admin-authored copy
 * can never inject markup into a customer-facing page.
 */

export interface ISeoFaq {
  question: string;
  answer: string;
}

export interface ISeoContent {
  heading?: string;
  description?: string;
  faqs?: ISeoFaq[];
}

// Generous enough for real category copy, tight enough that a paste accident
// can't bloat every product response in the sub-category.
const MAX_HEADING = 160;
const MAX_DESCRIPTION = 20000;
const MAX_QUESTION = 300;
const MAX_ANSWER = 4000;
const MAX_FAQS = 30;

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

/** Trims, normalizes line endings and caps length. Returns '' for empty input. */
const cleanText = (value: unknown, maxLength: number): string => {
  if (value === undefined || value === null) return '';
  return String(value)
    .replace(/\r\n?/g, '\n')
    .trim()
    .slice(0, maxLength);
};

/**
 * Normalizes an admin-supplied SEO content block into a storable shape.
 * Blank headings/descriptions and FAQ rows missing either side are dropped, so a
 * half-filled form never persists placeholder rows the storefront would render.
 */
export const sanitizeSeoContent = (input: unknown): ISeoContent => {
  if (!isPlainObject(input)) return {};

  const heading = cleanText(input.heading, MAX_HEADING);
  const description = cleanText(input.description, MAX_DESCRIPTION);

  const faqs: ISeoFaq[] = [];
  if (Array.isArray(input.faqs)) {
    for (const raw of input.faqs) {
      if (!isPlainObject(raw)) continue;
      const question = cleanText(raw.question, MAX_QUESTION);
      const answer = cleanText(raw.answer, MAX_ANSWER);
      if (!question || !answer) continue;
      faqs.push({ question, answer });
      if (faqs.length >= MAX_FAQS) break;
    }
  }

  const out: ISeoContent = {};
  if (heading) out.heading = heading;
  if (description) out.description = description;
  if (faqs.length) out.faqs = faqs;
  return out;
};

/** True when a block actually has something worth rendering. */
export const hasSeoContent = (content: unknown): boolean => {
  if (!isPlainObject(content)) return false;
  const faqs = content.faqs;
  return (
    !!cleanText(content.description, MAX_DESCRIPTION) ||
    (Array.isArray(faqs) && faqs.length > 0)
  );
};
