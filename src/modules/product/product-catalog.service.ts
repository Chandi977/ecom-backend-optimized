import mongoose from 'mongoose';
import Product from './product.model';
import ProductSpecification from './product-specification.model';
import Pricing from './pricing.model';
import Inventory from './inventory.model';
import ProductMedia from './product-media.model';
import SEO from './seo.model';

export const PRODUCT_POPULATE_PATHS = 'brand category sub_category specification pricing inventory media seo';

const SPEC_FIELD_KEYS = [
  'length', 'width', 'height',
  'length_inch', 'length_mm', 'breadth_inch', 'breadth_mm', 'height_inch', 'height_mm',
  'size_inch', 'size_mm', 'flap_mm', 'thickness', 'thickness_micron', 'gusset',
  'print', 'label_in_roll', 'core_size', 'pouch_weight', 'adhesive', 'material',
  'color', 'colour', 'weight', 'size',
] as const;

const isPresent = (value: unknown): boolean => value !== undefined && value !== null;

const pickPresent = (source: Record<string, unknown>, keys: readonly string[]): Record<string, unknown> => {
  const out: Record<string, unknown> = {};
  keys.forEach((key) => {
    if (isPresent(source[key])) out[key] = source[key];
  });
  return out;
};

const isObjectIdLike = (value: unknown): boolean =>
  value instanceof mongoose.Types.ObjectId || (value as Record<string, unknown> | undefined)?._bsontype === 'ObjectId';

const objectValue = (source: Record<string, unknown>, key: string): Record<string, unknown> => {
  const value = source[key];
  if (!value || typeof value !== 'object' || Array.isArray(value) || isObjectIdLike(value)) return {};
  const out = { ...(value as Record<string, unknown>) };
  delete out._id;
  delete out.product;
  delete out.createdAt;
  delete out.updatedAt;
  return out;
};

const firstImage = (images: unknown): unknown => {
  if (!Array.isArray(images) || images.length === 0) return undefined;
  return images[0];
};

const sumStockQuantity = (priceList: unknown): number | undefined => {
  if (!Array.isArray(priceList)) return undefined;
  return priceList.reduce((sum, item) => {
    const qty = Number((item as Record<string, unknown>)?.stock_quantity ?? 0);
    return Number.isFinite(qty) ? sum + qty : sum;
  }, 0);
};

const firstNumericTierValue = (priceList: unknown, key: string): number | undefined => {
  if (!Array.isArray(priceList) || priceList.length === 0) return undefined;
  const value = Number((priceList[0] as Record<string, unknown>)?.[key]);
  return Number.isFinite(value) ? value : undefined;
};

const toObjectId = (value: string | mongoose.Types.ObjectId): mongoose.Types.ObjectId =>
  typeof value === 'string' ? new (mongoose.Types.ObjectId as any)(value) : value;

export const buildLegacyProductPayload = (source: Record<string, unknown>): Record<string, unknown> => {
  const normalizedSpec = objectValue(source, 'specification');
  const normalizedPricing = objectValue(source, 'pricing');
  const normalizedMedia = objectValue(source, 'media');
  const normalizedSeo = objectValue(source, 'seo');

  return {
    ...pickPresent(normalizedSpec, SPEC_FIELD_KEYS),
    ...(isPresent(normalizedPricing.basePrice) ? { price: normalizedPricing.basePrice } : {}),
    ...(Array.isArray(normalizedPricing.priceList) ? { priceList: normalizedPricing.priceList } : {}),
    ...(Array.isArray(normalizedMedia.gallery) ? { images: normalizedMedia.gallery } : {}),
    ...pickPresent(normalizedSeo, ['meta_title', 'meta_description', 'overview_fields']),
    ...pickPresent(source, [
    'name', 'model', 'delivery_time', 'hsn_code', 'price', 'gst', 'meta_title',
    'meta_description', 'images', 'description', 'aboutItem', 'usage', 'product_id',
    'top_product', 'deal_product', 'priceList',
    ...SPEC_FIELD_KEYS,
    ]),
    ...(source.label_in_role !== undefined && source.label_in_roll === undefined
      ? { label_in_roll: source.label_in_role }
      : {}),
  };
};

export const syncProductCatalogRefs = async (
  productId: string | mongoose.Types.ObjectId,
  source: Record<string, unknown>,
): Promise<Record<string, mongoose.Types.ObjectId>> => {
  const product = toObjectId(productId);
  const normalizedSpec = objectValue(source, 'specification');
  const normalizedPricing = objectValue(source, 'pricing');
  const normalizedInventory = objectValue(source, 'inventory');
  const normalizedMedia = objectValue(source, 'media');
  const normalizedSeo = objectValue(source, 'seo');
  const specPayload = {
    product,
    ...normalizedSpec,
    ...pickPresent(source, SPEC_FIELD_KEYS),
    ...(source.label_in_role !== undefined && source.label_in_roll === undefined
      ? { label_in_roll: source.label_in_role }
      : {}),
  };
  const priceList = Array.isArray(source.priceList)
    ? source.priceList
    : Array.isArray(normalizedPricing.priceList) ? normalizedPricing.priceList : undefined;
  const pricingPayload = {
    product,
    ...normalizedPricing,
    ...(isPresent(source.price) ? { basePrice: source.price } : {}),
    ...(priceList ? { priceList } : {}),
    ...(isPresent(source.discount) ? { discount: source.discount } : {}),
    ...(isPresent(source.stockQuantity) ? { stockQuantity: source.stockQuantity } : {}),
    ...(isPresent(source.packWeight) ? { packWeight: source.packWeight } : {}),
  };
  if (!isPresent(pricingPayload.stockQuantity)) {
    const stockQuantity = sumStockQuantity(priceList);
    if (stockQuantity !== undefined) pricingPayload.stockQuantity = stockQuantity;
  }
  if (!isPresent(pricingPayload.packWeight)) {
    const packWeight = firstNumericTierValue(priceList, 'pack_weight');
    if (packWeight !== undefined) pricingPayload.packWeight = packWeight;
  }
  if (!isPresent(pricingPayload.discount)) {
    const discount = firstNumericTierValue(priceList, 'discount');
    if (discount !== undefined) pricingPayload.discount = discount;
  }

  const inventoryPayload = {
    product,
    ...normalizedInventory,
    ...(isPresent(source.availableStock) ? { availableStock: source.availableStock } : {}),
    ...(isPresent(source.reservedStock) ? { reservedStock: source.reservedStock } : {}),
    ...(isPresent(source.minimumStock) ? { minimumStock: source.minimumStock } : {}),
    ...(isPresent(source.warehouse) ? { warehouse: source.warehouse } : {}),
  };
  if (!isPresent(inventoryPayload.availableStock)) {
    const availableStock = sumStockQuantity(priceList);
    if (availableStock !== undefined) inventoryPayload.availableStock = availableStock;
  }

  const gallery = Array.isArray(source.gallery)
    ? source.gallery
    : Array.isArray(normalizedMedia.gallery) ? normalizedMedia.gallery : source.images;
  const mediaPayload = {
    product,
    ...normalizedMedia,
    ...(isPresent(source.thumbnail) ? { thumbnail: source.thumbnail } : {}),
    ...(Array.isArray(gallery) ? { gallery } : {}),
    ...(Array.isArray(source.videos) ? { videos: source.videos } : {}),
    ...(Array.isArray(source.documents) ? { documents: source.documents } : {}),
    ...(Array.isArray(source.images360) ? { images360: source.images360 } : {}),
  };
  if (!isPresent(mediaPayload.thumbnail)) {
    const thumbnail = firstImage(gallery);
    if (thumbnail !== undefined) mediaPayload.thumbnail = thumbnail;
  }

  const seoPayload = {
    product,
    ...normalizedSeo,
    ...(isPresent(source.meta_title) ? { meta_title: source.meta_title } : {}),
    ...(isPresent(source.meta_description) ? { meta_description: source.meta_description } : {}),
    ...(Array.isArray(source.overview_fields) ? { overview_fields: source.overview_fields } : {}),
    ...(isPresent(source.canonical) ? { canonical: source.canonical } : {}),
    ...(isPresent(source.schema_markup) ? { schema_markup: source.schema_markup } : {}),
    ...(Array.isArray(source.keywords) ? { keywords: source.keywords } : {}),
  };

  const [specification, pricing, inventory, media, seo] = await Promise.all([
    ProductSpecification.findOneAndUpdate({ product }, { $set: specPayload }, { upsert: true, new: true, setDefaultsOnInsert: true }).exec(),
    Pricing.findOneAndUpdate({ product }, { $set: pricingPayload }, { upsert: true, new: true, setDefaultsOnInsert: true }).exec(),
    Inventory.findOneAndUpdate({ product }, { $set: inventoryPayload }, { upsert: true, new: true, setDefaultsOnInsert: true }).exec(),
    ProductMedia.findOneAndUpdate({ product }, { $set: mediaPayload }, { upsert: true, new: true, setDefaultsOnInsert: true }).exec(),
    SEO.findOneAndUpdate({ product }, { $set: seoPayload }, { upsert: true, new: true, setDefaultsOnInsert: true }).exec(),
  ]);

  const refs = {
    specification: specification._id as mongoose.Types.ObjectId,
    pricing: pricing._id as mongoose.Types.ObjectId,
    inventory: inventory._id as mongoose.Types.ObjectId,
    media: media._id as mongoose.Types.ObjectId,
    seo: seo._id as mongoose.Types.ObjectId,
  };

  await Product.findByIdAndUpdate(product, { $set: refs }).exec();
  return refs;
};

const assignIfEmpty = (target: Record<string, unknown>, key: string, value: unknown): void => {
  const current = target[key];
  const emptyArray = Array.isArray(current) && current.length === 0;
  if ((current === undefined || current === null || current === '' || emptyArray) && isPresent(value)) {
    target[key] = value;
  }
};

const stripSidecarProductRef = (value: unknown): Record<string, unknown> | undefined => {
  if (!value || typeof value !== 'object' || isObjectIdLike(value)) return undefined;
  const out = { ...(value as Record<string, unknown>) };
  delete out.product;
  return out;
};

export const flattenProductCatalog = (
  product: unknown,
  options: { inherit?: boolean } = {},
): Record<string, unknown> | undefined => {
  // `inherit` (default true) backfills category/sub-category attributes for
  // display. Admin edit fetches pass `inherit: false` so the form receives the
  // product's OWN values only (blank = "inherit from category"), and never
  // re-persists an inherited value as a product-level override.
  const { inherit = true } = options;
  if (!product) return undefined;
  const plain = typeof (product as any).toObject === 'function'
    ? (product as any).toObject()
    : { ...(product as Record<string, unknown>) };

  const specification = stripSidecarProductRef(plain.specification);
  if (specification) {
    SPEC_FIELD_KEYS.forEach((key) => assignIfEmpty(plain, key, specification[key]));
  }

  const pricing = stripSidecarProductRef(plain.pricing);
  if (pricing) {
    assignIfEmpty(plain, 'price', pricing.basePrice);
    assignIfEmpty(plain, 'priceList', pricing.priceList);
    assignIfEmpty(plain, 'stock_quantity', pricing.stockQuantity);
  }

  const media = stripSidecarProductRef(plain.media);
  if (media) {
    const gallery = Array.isArray(media.gallery) ? media.gallery : [];
    assignIfEmpty(plain, 'images', gallery.length ? gallery : media.thumbnail ? [media.thumbnail] : undefined);
  }

  const seo = stripSidecarProductRef(plain.seo);
  if (seo) {
    assignIfEmpty(plain, 'meta_title', seo.meta_title);
    assignIfEmpty(plain, 'meta_description', seo.meta_description);
    assignIfEmpty(plain, 'overview_fields', seo.overview_fields);
  }

  // --- Category / sub-category attribute inheritance ---------------------------
  // Backfill any category-wide attribute the product (and its sidecars) left
  // blank, from the most specific owner to the least: sub_category -> category.
  // assignIfEmpty guarantees explicit per-product values always win, so the flat
  // catalog-filter fields stay correct. `category` / `sub_category` are populated
  // by PRODUCT_POPULATE_PATHS; when left as ObjectIds, inheritance is skipped.
  const inheritFrom = (owner: Record<string, unknown> | undefined): void => {
    if (!owner) return;
    // gst is a first-class field on the owner, not part of common_attributes.
    assignIfEmpty(plain, 'gst', owner.gst);
    const common = owner.common_attributes;
    if (common && typeof common === 'object' && !Array.isArray(common)) {
      Object.entries(common as Record<string, unknown>).forEach(([key, value]) =>
        assignIfEmpty(plain, key, value),
      );
    }
    // Spec-field default values declared on the schema fill any field still empty.
    if (Array.isArray(owner.spec_schema)) {
      owner.spec_schema.forEach((field) => {
        const def = field as Record<string, unknown>;
        if (typeof def?.key === 'string' && isPresent(def.default_value)) {
          assignIfEmpty(plain, def.key, def.default_value);
        }
      });
    }
  };

  if (inherit) {
    inheritFrom(stripSidecarProductRef(plain.sub_category));
    inheritFrom(stripSidecarProductRef(plain.category));
  }

  return plain;
};

export const flattenProductCatalogList = <T extends Record<string, unknown>>(products: T[]): T[] =>
  products.map((product) => flattenProductCatalog(product) as T);

export const deleteProductCatalogRefs = async (productIds: unknown[]): Promise<void> => {
  const ids = productIds
    .map((id) => ((mongoose.Types.ObjectId as any).isValid(String(id)) ? new (mongoose.Types.ObjectId as any)(String(id)) : null))
    .filter(Boolean);
  if (!ids.length) return;

  await Promise.all([
    ProductSpecification.deleteMany({ product: { $in: ids } }).exec(),
    Pricing.deleteMany({ product: { $in: ids } }).exec(),
    Inventory.deleteMany({ product: { $in: ids } }).exec(),
    ProductMedia.deleteMany({ product: { $in: ids } }).exec(),
    SEO.deleteMany({ product: { $in: ids } }).exec(),
  ]);
};
