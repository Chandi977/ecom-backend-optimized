import ProductVariant from './product-variant.model';
import {
  createProductVariantSchema,
  updateProductVariantSchema,
  deleteProductVariantSchema,
} from '../../utils/validators/zod-schemas';

const PRODUCT_ID = '64b000000000000000000001';

describe('ProductVariant model', () => {
  it('registers under the expected model name', () => {
    expect(ProductVariant.modelName).toBe('ProductVariant');
  });

  it('declares product as required and sku as unique+sparse', () => {
    const productPath = ProductVariant.schema.path('product') as { isRequired?: boolean };
    const skuPath = ProductVariant.schema.path('sku') as { options?: { unique?: boolean; sparse?: boolean } };
    expect(productPath.isRequired).toBe(true);
    expect(skuPath.options?.unique).toBe(true);
    expect(skuPath.options?.sparse).toBe(true);
  });
});

describe('ProductVariant validation', () => {
  it('accepts a well-formed variant and strips unknown keys', () => {
    const result = createProductVariantSchema.safeParse({
      product: PRODUCT_ID,
      sku: 'BAG-5PLY-BROWN',
      attributes: { ply: 5, colour: 'brown' },
      pack_size: 50,
      price: 299,
      dimensions: { length: 196, width: 102, unit: 'mm' },
      bogus: 'drop me',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.sku).toBe('BAG-5PLY-BROWN');
      expect(result.data.dimensions).toEqual({ length: 196, width: 102, unit: 'mm' });
      expect((result.data as Record<string, unknown>).bogus).toBeUndefined();
    }
  });

  it('requires product on create', () => {
    expect(createProductVariantSchema.safeParse({ sku: 'X' }).success).toBe(false);
  });

  it('requires id on update and allows partial fields', () => {
    expect(updateProductVariantSchema.safeParse({ price: 10 }).success).toBe(false);
    expect(updateProductVariantSchema.safeParse({ id: 'abc', price: 10 }).success).toBe(true);
  });

  it('accepts a single id or an array of ids on delete', () => {
    expect(deleteProductVariantSchema.safeParse({ id: 'abc' }).success).toBe(true);
    expect(deleteProductVariantSchema.safeParse({ id: ['a', 'b'] }).success).toBe(true);
  });
});
