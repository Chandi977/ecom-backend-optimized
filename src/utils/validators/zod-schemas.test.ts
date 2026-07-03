import { filterProductsSchema } from './zod-schemas';

describe('filterProductsSchema', () => {
  it('accepts catalog filter payloads used by SSR and infinite scroll', () => {
    const result = filterProductsSchema.safeParse({
      category: ['aaaaaaaaaaaaaaaaaaaaaaaa'],
      brand: ['bbbbbbbbbbbbbbbbbbbbbbbb'],
      subcategory: 'cccccccccccccccccccccccc',
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
