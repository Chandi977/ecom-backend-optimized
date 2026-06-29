import mongoose, { Schema, Document } from 'mongoose';
import { IAttributeDefinition } from '../../types';

export interface IAttributeDefinitionDocument
  extends Omit<IAttributeDefinition, '_id'>, Document {}

// A reusable, admin-managed definition of a product attribute (spec). Replaces
// hard-coded per-category spec fields: a product stores only the value under this
// `key` (on the ProductSpecification sidecar, Phase 3) while this collection owns
// the presentation/validation metadata and which categories/sub-categories use it.
// New product families therefore need configuration here, not a schema change.
const attributeDefinitionSchema = new Schema<IAttributeDefinitionDocument>(
  {
    // Canonical attribute key (e.g. 'core_size'). The contract between product
    // values and this definition; unique across the catalog.
    key: { type: String, required: true, unique: true, trim: true },
    label: { type: String, required: true },
    description: { type: String },
    type: { type: String, enum: ['number', 'select', 'text', 'boolean'], default: 'text' },
    unit: { type: String },
    // Allowed values for `select` attributes.
    options: { type: [String], default: undefined },
    required: { type: Boolean, default: false },
    searchable: { type: Boolean, default: false },
    filterable: { type: Boolean, default: false },
    sortable: { type: Boolean, default: false },
    default_value: { type: Schema.Types.Mixed },
    // Categories / sub-categories this attribute applies to. Empty = unscoped.
    categories: { type: [{ type: Schema.Types.ObjectId, ref: 'Category' }], default: [] },
    sub_categories: { type: [{ type: Schema.Types.ObjectId, ref: 'SubCategory' }], default: [] },
    order: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

// `key` already has a unique index from its path definition.
attributeDefinitionSchema.index({ categories: 1 });
attributeDefinitionSchema.index({ sub_categories: 1 });
attributeDefinitionSchema.index({ isActive: 1, order: 1 });

const AttributeDefinition = mongoose.model<IAttributeDefinitionDocument>(
  'AttributeDefinition',
  attributeDefinitionSchema,
);
export default AttributeDefinition;
