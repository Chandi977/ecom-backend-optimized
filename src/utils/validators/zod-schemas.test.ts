import { filterProductsSchema } from './zod-schemas';

describe('filterProductsSchema', () => {
  it('accepts catalog filter payloads used by SSR and infinite scroll', () => {
    const result = filterProductsSchema.safeParse({
      category: ['6926d7c0d53f3a772c6f08af'],
      brand: ['69268af9d53f3a772c6bccc2'],
      subcategory: '6557dbcc301ec4f2f426610b',
      length: { min: 0, max: 20 },
      breadth: { min: 0, max: 20 },
      height: { min: 0, max: 20 },
      skip: 0,
      limit: 20,
      includeMeta: true,
    });

    expect(result.success).toBe(true);
  });
});
