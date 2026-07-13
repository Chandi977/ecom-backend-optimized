import mongoose, { Schema, Document } from "mongoose";
import { IProduct, IPriceListItem, IOverviewField } from "../../types";

export interface IProductDocument
  extends Omit<IProduct, "_id" | "model">, Omit<Document, "model"> {
  model?: string;
}

const priceListItemSchema = new Schema(
  {
    number: {
      type: Number,
      required: true,
    },
    price: {
      type: Number,
      required: true,
    },
    original_price: {
      type: Number,
    },
    price_regional: {
      type: Number,
    },
    price_national: {
      type: Number,
    },
    stock_quantity: {
      type: Number,
      default: 0,
    },
    discount: {
      type: Number,
      default: 0,
    },
    pack_weight: {
      type: Number,
    },
  },
  { _id: false },
);

const overviewFieldSchema = new Schema(
  {
    label: { type: String, required: true },
    value: { type: String },
    // Stable identifier for auto-generated fields so the storefront can match a
    // saved visibility/order config back to a live, dynamically-valued field.
    key: { type: String },
    // Admin-controlled show/hide on the Product Details page. Defaults to true
    // so legacy rows (saved before this field existed) stay visible.
    visible: { type: Boolean, default: true },
  },
  { _id: false },
);

const productSchema = new Schema<IProductDocument>(
  {
    brand: {
      type: Schema.Types.ObjectId,
      ref: "Brand",
    },
    name: {
      type: String,
      required: true,
    },
    model: {
      type: String,
    },
    slug: {
      type: String,
      unique: true,
      sparse: true,
    },
    category: {
      type: Schema.Types.ObjectId,
      ref: "Category",
    },
    sub_category: {
      type: Schema.Types.ObjectId,
      ref: "SubCategory",
    },
    specification: {
      type: Schema.Types.ObjectId,
      ref: "ProductSpecification",
    },
    pricing: {
      type: Schema.Types.ObjectId,
      ref: "Pricing",
    },
    inventory: {
      type: Schema.Types.ObjectId,
      ref: "Inventory",
    },
    media: {
      type: Schema.Types.ObjectId,
      ref: "ProductMedia",
    },
    seo: {
      type: Schema.Types.ObjectId,
      ref: "SEO",
    },
    images: {
      type: [Schema.Types.Mixed],
      default: [],
    },
    price: {
      type: Number,
    },
    priceList: {
      type: [priceListItemSchema],
      default: [],
    },
    gst: {
      // No default. Products inherit GST from sub_category -> category at order
      // time (gst-calculator) and at response time (flattenProductCatalog), so the
      // same rate is no longer stored on every product document. An explicit
      // per-product gst still overrides the inherited rate.
      type: Number,
    },
    description: { type: String },
    aboutItem: { type: String },
    usage: { type: String },
    hsn_code: { type: String },
    sac_code: { type: String },
    tax_category: { type: String },
    delivery_time: { type: String },
    // Category-specific spec fields (dimensions, material, print, adhesive, …).
    length: { type: Number },
    width: { type: Number },
    height: { type: Number },
    length_inch: { type: Number },
    length_mm: { type: Number },
    breadth_inch: { type: Number },
    breadth_mm: { type: Number },
    height_inch: { type: Number },
    height_mm: { type: Number },
    size_inch: { type: String },
    size_mm: { type: String },
    flap_mm: { type: Number },
    thickness: { type: Number },
    thickness_micron: { type: Number },
    gusset: { type: Number },
    print: { type: String },
    label_in_roll: { type: String },
    core_size: { type: Number },
    pouch_weight: { type: Number },
    adhesive: { type: String },
    material: { type: String },
    color: { type: String },
    product_id: { type: String },
    // Admin-internal catalog audit date (free-form, e.g. "23/9"). Not shown on
    // storefront/mobile — surfaced by the admin Excel grid to track review status.
    reviewed_on: { type: String },
    top_product: { type: Boolean, default: false },
    deal_product: { type: Boolean, default: false },
    meta_title: { type: String },
    meta_description: { type: String },
    buyItWith: [{ type: Schema.Types.ObjectId, ref: "Product" }],
    relatedProducts: [{ type: Schema.Types.ObjectId, ref: "Product" }],
    overview_fields: { type: [overviewFieldSchema], default: [] },
    // Admin-controlled storefront visibility map (key -> boolean). Stored as a
    // free-form object so new toggles (spec rows, sections, notes, badges) need
    // no schema change. A missing/true key renders the field; only `false` hides
    // it, keeping legacy products fully visible.
    field_visibility: { type: Schema.Types.Mixed, default: {} },
  },
  {
    timestamps: true,
  },
);

// --- Indexes ---
// `slug` already has a unique+sparse index from its path definition (no duplicate here).
//
// Catalog filtering (filterProducts / filterBopp / filterPoly / filterLabel /
// getSubCategoryAvailability) always narrows by some combination of
// category / brand / sub_category and then sorts by `_id`. A single compound
// index whose prefix is category covers category, category+brand and
// category+brand+sub_category lookups, with `_id` supporting the sort/pagination.
productSchema.index({ category: 1, brand: 1, sub_category: 1, _id: 1 });
// Plain category-page pagination (no brand/sub_category): category equality with
// `_id` giving an index-ordered sort so MongoDB can skip the in-memory SORT stage.
productSchema.index({ category: 1, _id: 1 });
// Brand-led and sub_category-led filters (used independently of category).
productSchema.index({ brand: 1, _id: 1 });
productSchema.index({ sub_category: 1, _id: 1 });
// Exact lookups used by search endpoints.
productSchema.index({ name: 1 });
productSchema.index({ product_id: 1 });
productSchema.index({ specification: 1 });
productSchema.index({ pricing: 1 });
productSchema.index({ inventory: 1 });
productSchema.index({ media: 1 });
productSchema.index({ seo: 1 });
// Full-text index backing the main search bar (searchMainProducts). For longer,
// word-like queries this gives an indexed, relevance-ranked result set instead of
// a full-collection $regex scan. A collection may have only ONE text index.
// `product_id` is deliberately excluded — SKUs are matched by exact equality via
// the { product_id: 1 } index above, not by tokenized/stemmed text search. Text
// search only matches whole (stemmed) words, so short prefixes and substring
// lookups still fall back to $regex in the controller.
productSchema.index({ name: 'text', model: 'text' });
// Home / merchandising flags — partial indexes so only flagged docs are stored,
// keeping the index tiny and write cost negligible.
productSchema.index({ top_product: 1, _id: 1 }, {
  partialFilterExpression: { top_product: true },
} as any);
productSchema.index({ deal_product: 1, _id: 1 }, {
  partialFilterExpression: { deal_product: true },
} as any);

// Catalog dimension filters (filterProducts / filterBopp / filterPoly /
// filterLabel) narrow by category and then range-match a single spec field. One
// partial compound index per filterable dimension keeps those queries on an
// IXSCAN while staying small — only documents that actually carry the dimension
// are indexed, so product families that don't use a given spec cost nothing.
const DIMENSION_FILTER_KEYS = [
  'length_mm', 'breadth_mm', 'height_mm',
  'length_inch', 'breadth_inch', 'height_inch',
  'flap_mm', 'thickness_micron', 'gusset', 'core_size',
] as const;
DIMENSION_FILTER_KEYS.forEach((dim) => {
  productSchema.index({ category: 1, [dim]: 1 }, {
    partialFilterExpression: { [dim]: { $exists: true } },
  } as any);
});

const Product = mongoose.model<IProductDocument>("Product", productSchema);
export default Product;
