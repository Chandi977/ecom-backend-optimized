// Locks in the product -> category auto-link that keeps the GST / HSN / attribute
// inheritance chain complete for ANY category/sub-category (not just specific ones).
const makeQuery = (result: unknown) => {
  const q: Record<string, jest.Mock> = {};
  q.select = jest.fn(() => q);
  q.lean = jest.fn(() => q);
  q.exec = jest.fn().mockResolvedValue(result);
  return q;
};

jest.mock('../subcategory/subcategory.model', () => ({
  __esModule: true,
  default: { findById: jest.fn() },
}));

import { resolveCategoryLink } from './product-catalog.service';
import SubCategory from '../subcategory/subcategory.model';

const mockSub = SubCategory as unknown as { findById: jest.Mock };

describe('resolveCategoryLink', () => {
  beforeEach(() => mockSub.findById.mockReset());

  it('respects an explicitly provided category without a lookup', async () => {
    expect(await resolveCategoryLink('catA', 'sub1')).toBe('catA');
    expect(mockSub.findById).not.toHaveBeenCalled();
  });

  it("fills the category from the sub-category's parent when none was provided", async () => {
    mockSub.findById.mockReturnValue(makeQuery({ category: 'catParent' }));
    expect(await resolveCategoryLink(undefined, 'sub1')).toBe('catParent');
    expect(mockSub.findById).toHaveBeenCalledWith('sub1');
  });

  it('returns undefined when neither category nor sub-category is given', async () => {
    expect(await resolveCategoryLink(undefined, undefined)).toBeUndefined();
    expect(mockSub.findById).not.toHaveBeenCalled();
  });

  it('falls back to undefined when the sub-category has no parent category', async () => {
    mockSub.findById.mockReturnValue(makeQuery({ category: undefined }));
    expect(await resolveCategoryLink(undefined, 'sub1')).toBeUndefined();
  });
});
