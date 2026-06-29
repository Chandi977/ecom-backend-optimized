import AttributeDefinition from './attribute.model';
import {
  createAttributeDefinitionSchema,
  updateAttributeDefinitionSchema,
  deleteAttributeDefinitionSchema,
} from '../../utils/validators/zod-schemas';

describe('AttributeDefinition model', () => {
  it('registers under the expected model name', () => {
    expect(AttributeDefinition.modelName).toBe('AttributeDefinition');
  });

  it('declares key as a unique, required path', () => {
    const keyPath = AttributeDefinition.schema.path('key') as { isRequired?: boolean; options?: { unique?: boolean } };
    expect(keyPath.isRequired).toBe(true);
    expect(keyPath.options?.unique).toBe(true);
  });
});

describe('AttributeDefinition validation', () => {
  it('accepts a well-formed definition and strips unknown keys', () => {
    const result = createAttributeDefinitionSchema.safeParse({
      key: 'core_size',
      label: 'Core Size',
      type: 'number',
      unit: 'inch',
      filterable: true,
      categories: ['64b000000000000000000001'],
      bogus: 'should be removed',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.key).toBe('core_size');
      expect(result.data.filterable).toBe(true);
      expect((result.data as Record<string, unknown>).bogus).toBeUndefined();
    }
  });

  it('rejects a missing key', () => {
    const result = createAttributeDefinitionSchema.safeParse({ label: 'No Key' });
    expect(result.success).toBe(false);
  });

  it('rejects an invalid type', () => {
    const result = createAttributeDefinitionSchema.safeParse({ key: 'k', label: 'L', type: 'colour' });
    expect(result.success).toBe(false);
  });

  it('requires an id on update and allows partial fields', () => {
    expect(updateAttributeDefinitionSchema.safeParse({ label: 'X' }).success).toBe(false);
    expect(updateAttributeDefinitionSchema.safeParse({ id: 'abc', label: 'X' }).success).toBe(true);
  });

  it('accepts a single id or an array of ids on delete', () => {
    expect(deleteAttributeDefinitionSchema.safeParse({ id: 'abc' }).success).toBe(true);
    expect(deleteAttributeDefinitionSchema.safeParse({ id: ['a', 'b'] }).success).toBe(true);
  });
});
