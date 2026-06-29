// Smoke test for the order-time GST path. Locks in the per-product GST
// priority introduced 2026-06-25: product.gst wins over sub_category / category,
// falling back to those (then 18%) only when the product has no own rate.
//
// The Product model is mocked so the test exercises the real calculateOrderGST
// (and its internal resolveProductGstRate) without a database.

// Fluent query-builder stub mirroring the chain calculateOrderGST uses:
//   Product.find(...).select(...).populate(...).populate(...).lean().exec()
const makeQuery = (result: unknown[]) => {
  const query: Record<string, jest.Mock> = {};
  query.select = jest.fn(() => query);
  query.populate = jest.fn(() => query);
  query.lean = jest.fn(() => query);
  query.exec = jest.fn().mockResolvedValue(result);
  return query;
};

jest.mock('../modules/product/product.model', () => ({
  __esModule: true,
  default: { find: jest.fn() },
}));

import { calculateOrderGST } from './gst-calculator';
import Product from '../modules/product/product.model';

const mockProduct = Product as unknown as { find: jest.Mock };

const item = (product: string, price: number, quantity: number) => ({
  product,
  price,
  quantity,
  packSize: 1,
});

describe('calculateOrderGST — per-product GST priority (product wins)', () => {
  it('uses the product gst even when sub_category and category also have rates', async () => {
    mockProduct.find.mockReturnValue(
      makeQuery([{ _id: 'p1', gst: 5, category: { gst: 12 }, sub_category: { gst: 28 } }]),
    );

    const result = await calculateOrderGST([item('p1', 100, 2)], 0);

    expect(result.itemsWithGst[0].gst).toBe(5);
    // 200 line total * 5% = 10
    expect(result.itemsWithGst[0].gstAmount).toBe(10);
    expect(result.totalGst).toBe(10);
    expect(result.taxableAmount).toBe(200);
    expect(result.totalOrderValue).toBe(210);
  });

  it('falls back to sub_category gst when the product has none', async () => {
    mockProduct.find.mockReturnValue(
      makeQuery([{ _id: 'p2', gst: undefined, category: { gst: 12 }, sub_category: { gst: 28 } }]),
    );

    const result = await calculateOrderGST([item('p2', 100, 1)], 0);

    expect(result.itemsWithGst[0].gst).toBe(28);
    expect(result.itemsWithGst[0].gstAmount).toBe(28);
  });

  it('falls back to category gst when product and sub_category have none', async () => {
    mockProduct.find.mockReturnValue(
      makeQuery([{ _id: 'p3', category: { gst: 12 }, sub_category: null }]),
    );

    const result = await calculateOrderGST([item('p3', 100, 1)], 0);

    expect(result.itemsWithGst[0].gst).toBe(12);
  });

  it('falls back to the 18% default when nothing has a rate', async () => {
    mockProduct.find.mockReturnValue(
      makeQuery([{ _id: 'p4', category: null, sub_category: null }]),
    );

    const result = await calculateOrderGST([item('p4', 100, 1)], 0);

    expect(result.itemsWithGst[0].gst).toBe(18);
  });

  it('always taxes shipping at the 18% default and rolls it into the totals', async () => {
    mockProduct.find.mockReturnValue(
      makeQuery([{ _id: 'p1', gst: 5, category: { gst: 12 }, sub_category: { gst: 28 } }]),
    );

    const result = await calculateOrderGST([item('p1', 100, 1)], 50);

    // item: 100 * 5% = 5 ; shipping: 50 * 18% = 9 ; total gst = 14
    expect(result.totalGst).toBe(14);
    expect(result.taxableAmount).toBe(150); // 100 item + 50 shipping
    expect(result.totalOrderValue).toBe(164); // 150 + 14
  });
});

describe('calculateOrderGST — HSN code resolution (product -> sub_category -> category)', () => {
  it('uses the product hsn_code when present', async () => {
    mockProduct.find.mockReturnValue(
      makeQuery([{ _id: 'p1', hsn_code: '4821', category: { hsn_code: '9999' }, sub_category: { hsn_code: '8888' } }]),
    );

    const result = await calculateOrderGST([item('p1', 100, 1)], 0);

    expect(result.itemsWithGst[0].hsn_code).toBe('4821');
  });

  it('falls back to sub_category hsn_code, then category, when the product has none', async () => {
    mockProduct.find.mockReturnValue(
      makeQuery([{ _id: 'p2', category: { hsn_code: '9999' }, sub_category: { hsn_code: '8888' } }]),
    );
    const r1 = await calculateOrderGST([item('p2', 100, 1)], 0);
    expect(r1.itemsWithGst[0].hsn_code).toBe('8888'); // sub_category wins over category

    mockProduct.find.mockReturnValue(
      makeQuery([{ _id: 'p3', category: { hsn_code: '9999' }, sub_category: null }]),
    );
    const r2 = await calculateOrderGST([item('p3', 100, 1)], 0);
    expect(r2.itemsWithGst[0].hsn_code).toBe('9999'); // falls through to category
  });

  it('omits hsn_code when none is set on product, sub_category or category', async () => {
    mockProduct.find.mockReturnValue(
      makeQuery([{ _id: 'p4', category: null, sub_category: null }]),
    );

    const result = await calculateOrderGST([item('p4', 100, 1)], 0);

    expect(result.itemsWithGst[0].hsn_code).toBeUndefined();
  });
});
