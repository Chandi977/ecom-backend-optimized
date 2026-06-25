import mongoose, { Document, Schema } from 'mongoose';

export interface IProductSpecificationDocument extends Document {
  product: mongoose.Types.ObjectId;
  length?: number;
  width?: number;
  height?: number;
  length_mm?: number;
  breadth_mm?: number;
  height_mm?: number;
  length_inch?: number;
  breadth_inch?: number;
  height_inch?: number;
  size_inch?: string;
  size_mm?: string;
  flap_mm?: number;
  gusset?: number;
  core_size?: number;
  material?: string;
  color?: string;
  colour?: string;
  adhesive?: string;
  print?: string;
  thickness?: number;
  thickness_micron?: number;
  label_in_roll?: string;
  pouch_weight?: number;
  weight?: number;
  size?: string;
  attributes?: Map<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const productSpecificationSchema = new Schema<IProductSpecificationDocument>(
  {
    product: { type: Schema.Types.ObjectId, ref: 'Product', required: true, unique: true },
    length: { type: Number },
    width: { type: Number },
    height: { type: Number },
    length_mm: { type: Number },
    breadth_mm: { type: Number },
    height_mm: { type: Number },
    length_inch: { type: Number },
    breadth_inch: { type: Number },
    height_inch: { type: Number },
    size_inch: { type: String },
    size_mm: { type: String },
    flap_mm: { type: Number },
    gusset: { type: Number },
    core_size: { type: Number },
    material: { type: String },
    color: { type: String },
    colour: { type: String },
    adhesive: { type: String },
    print: { type: String },
    thickness: { type: Number },
    thickness_micron: { type: Number },
    label_in_roll: { type: String },
    pouch_weight: { type: Number },
    weight: { type: Number },
    size: { type: String },
    attributes: { type: Map, of: Schema.Types.Mixed, default: undefined },
  },
  { timestamps: true },
);

productSpecificationSchema.index({ material: 1 });
productSpecificationSchema.index({ color: 1 });
productSpecificationSchema.index({ length_mm: 1, breadth_mm: 1, height_mm: 1 });
productSpecificationSchema.index({ length_inch: 1, breadth_inch: 1, height_inch: 1 });
productSpecificationSchema.index({ thickness_micron: 1 });
productSpecificationSchema.index({ 'attributes.$**': 1 });

const ProductSpecification = mongoose.model<IProductSpecificationDocument>(
  'ProductSpecification',
  productSpecificationSchema,
);

export default ProductSpecification;
