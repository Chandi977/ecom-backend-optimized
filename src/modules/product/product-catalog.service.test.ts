import { flattenProductCatalog } from './product-catalog.service';

// Guards the category/sub-category -> product inheritance for the first-class
// tax/fulfillment defaults (gst, hsn_code, sac_code, tax_category, delivery_time):
// the product's own value always wins, sub_category beats category, and the
// admin-edit path (inherit:false) never backfills inherited values.
describe('flattenProductCatalog tax/fulfillment inheritance', () => {
  const category = {
    _id: 'cat1',
    gst: 18,
    hsn_code: '4819',
    sac_code: 'SAC100',
    tax_category: 'standard',
    delivery_time: '3-5 days',
  };

  it('backfills category defaults when the product leaves them blank', () => {
    const out = flattenProductCatalog({ _id: 'p1', name: 'Box', category: { ...category } })!;
    expect(out.gst).toBe(18);
    expect(out.hsn_code).toBe('4819');
    expect(out.sac_code).toBe('SAC100');
    expect(out.tax_category).toBe('standard');
    expect(out.delivery_time).toBe('3-5 days');
  });

  it('keeps the product own values (product wins over category)', () => {
    const out = flattenProductCatalog({
      _id: 'p1',
      name: 'Box',
      hsn_code: '9999',
      delivery_time: 'next day',
      category: { ...category },
    })!;
    expect(out.hsn_code).toBe('9999');
    expect(out.delivery_time).toBe('next day');
    // fields the product left blank still inherit
    expect(out.sac_code).toBe('SAC100');
    expect(out.tax_category).toBe('standard');
  });

  it('prefers sub_category over category', () => {
    const out = flattenProductCatalog({
      _id: 'p1',
      name: 'Box',
      sub_category: { _id: 'sc1', hsn_code: '7777' },
      category: { ...category },
    })!;
    expect(out.hsn_code).toBe('7777'); // sub_category wins
    expect(out.delivery_time).toBe('3-5 days'); // not set on sub_category -> category
  });

  it('does not backfill when inherit:false (admin edit source)', () => {
    const out = flattenProductCatalog(
      { _id: 'p1', name: 'Box', category: { ...category } },
      { inherit: false },
    )!;
    expect(out.hsn_code).toBeUndefined();
    expect(out.delivery_time).toBeUndefined();
    expect(out.gst).toBeUndefined();
  });
});

describe('flattenProductCatalog dynamic attributes (ProductSpecification sidecar)', () => {
  it('surfaces sidecar attributes onto product.attributes and flattens each key', () => {
    const out = flattenProductCatalog({
      _id: 'p1',
      name: 'Bag',
      specification: { product: 'p1', attributes: { ply: 5, handle: 'twisted' } },
    })!;
    expect(out.attributes).toEqual({ ply: 5, handle: 'twisted' });
    expect(out.ply).toBe(5);
    expect(out.handle).toBe('twisted');
  });

  it('lets an explicit product field win over a sidecar attribute of the same key', () => {
    const out = flattenProductCatalog({
      _id: 'p1',
      name: 'Bag',
      ply: 3,
      specification: { product: 'p1', attributes: { ply: 5 } },
    })!;
    expect(out.ply).toBe(3); // product flat field wins
    expect(out.attributes).toEqual({ ply: 5 }); // raw map still exposed
  });

  it('handles attributes stored as a Mongoose Map', () => {
    const out = flattenProductCatalog({
      _id: 'p1',
      name: 'Bag',
      specification: { product: 'p1', attributes: new Map<string, unknown>([['gsm', 140]]) },
    })!;
    expect(out.gsm).toBe(140);
    expect(out.attributes).toEqual({ gsm: 140 });
  });
});
