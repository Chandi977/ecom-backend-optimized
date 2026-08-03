import { Request } from 'express';

export interface IUser {
  _id: string;
  first_name: string;
  last_name: string;
  email_address: string;
  password: string;
  mobile_number?: string;
  role: string;
  gender?: string;
  user_id?: string;
  profile_image?: string;
  contact_address?: IAddress[];
  couponUsed?: string[];
  googleId?: string;
  authProvider?: string;
  isVerified: boolean;
  verification_token?: string;
  verification_token_expiry?: Date;
  privacyPreferences?: IPrivacyPreferences;
  createdAt: Date;
  updatedAt: Date;
}

export interface IPrivacyPreferences {
  emailNotifications: boolean;
  smsNotifications: boolean;
  personalizedRecommendations: boolean;
  usageAnalytics: boolean;
}

export interface IAddress {
  name?: string;
  phone?: string;
  mobile?: string;
  email?: string;
  gstin?: string;
  address?: string;
  town?: string;
  state?: string;
  pincode?: string;
  landmark?: string;
  isDefault?: boolean;
}

export interface IProduct {
  _id: string;
  brand?: string;
  name: string;
  model?: string;
  slug: string;
  category?: string;
  sub_category?: string;
  specification?: string | IProductSpecification;
  pricing?: string | IPricing;
  inventory?: string | IInventory;
  media?: string | IProductMedia;
  seo?: string | ISEO;
  images?: Array<string | IProductImage>;
  price?: number;
  priceList?: IPriceListItem[];
  gst?: number;
  description?: string;
  aboutItem?: string;
  usage?: string;
  hsn_code?: string;
  sac_code?: string;
  tax_category?: string;
  delivery_time?: string;
  // Category-specific spec fields stored flat on the product.
  material?: string;
  color?: string;
  length?: number;
  width?: number;
  height?: number;
  length_inch?: number;
  length_mm?: number;
  breadth_inch?: number;
  breadth_mm?: number;
  height_inch?: number;
  height_mm?: number;
  size_inch?: string;
  size_mm?: string;
  flap_mm?: number;
  thickness?: number;
  thickness_micron?: number;
  gusset?: number;
  print?: string;
  label_in_roll?: string;
  core_size?: number;
  pouch_weight?: number;
  product_id?: string;
  // Admin-internal catalog audit date (free-form, e.g. "23/9"). Not rendered on
  // storefront/mobile — used by the admin Excel grid to track review status.
  reviewed_on?: string;
  top_product?: boolean;
  deal_product?: boolean;
  // Denormalized customer-review rating summary (see review module).
  ratingAverage?: number;
  ratingCount?: number;
  meta_title?: string;
  meta_description?: string;
  buyItWith?: string[];
  relatedProducts?: string[];
  overview_fields?: IOverviewField[];
  category_overview_fields?: IOverviewField[];
  // Admin-controlled storefront visibility map: key -> shown?. A missing key
  // means "visible", so existing products stay fully shown until an admin hides
  // something. Keys are namespaced (e.g. "spec:length_inch", "section:specifications",
  // "note:gst", "badge:recyclable", "price:mrp").
  field_visibility?: Record<string, boolean>;
  stock_quantity?: number;
  adhesive?: string;
  // Dynamic, category-defined attributes surfaced from the ProductSpecification
  // sidecar's `attributes` map; also flattened onto the product for back-compat.
  attributes?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface IProductImage {
  _id?: string;
  image?: string;
}

export interface IProductSpecification {
  _id?: string;
  product?: string;
  material?: string;
  color?: string;
  colour?: string;
  adhesive?: string;
  print?: string;
  length?: number;
  width?: number;
  height?: number;
  length_inch?: number;
  length_mm?: number;
  breadth_inch?: number;
  breadth_mm?: number;
  height_inch?: number;
  height_mm?: number;
  size_inch?: string;
  size_mm?: string;
  flap_mm?: number;
  thickness?: number;
  thickness_micron?: number;
  gusset?: number;
  label_in_roll?: string;
  core_size?: number;
  pouch_weight?: number;
  weight?: number;
  size?: string;
  attributes?: Record<string, unknown>;
}

export interface IPricing {
  _id?: string;
  product?: string;
  basePrice?: number;
  priceList?: IPriceListItem[];
  discount?: number;
  stockQuantity?: number;
  packWeight?: number;
}

export interface IInventory {
  _id?: string;
  product?: string;
  availableStock?: number;
  reservedStock?: number;
  minimumStock?: number;
  warehouse?: unknown;
  metadata?: Record<string, unknown>;
}

export interface IProductMedia {
  _id?: string;
  product?: string;
  thumbnail?: unknown;
  gallery?: unknown[];
  videos?: unknown[];
  documents?: unknown[];
  images360?: unknown[];
}

export interface ISEO {
  _id?: string;
  product?: string;
  meta_title?: string;
  meta_description?: string;
  overview_fields?: IOverviewField[];
  canonical?: string;
  schema_markup?: unknown;
  keywords?: string[];
}

export interface IPriceListItem {
  number: number;
  price: number;
  original_price?: number;
  price_regional?: number;
  price_national?: number;
  stock_quantity: number;
  discount?: number;
  pack_weight?: number;
}

export interface IOverviewField {
  label: string;
  value?: string;
  key?: string;
  visible?: boolean;
}

// Definition of a single spec field a category exposes. Drives the admin spec
// form and the storefront spec rendering, replacing hard-coded spec schemas.
export interface ISpecSchemaField {
  key: string;
  label: string;
  type: 'number' | 'select' | 'text';
  options?: string[];
  required?: boolean;
  unit?: string;
  default_value?: unknown;
}

export interface ICategory {
  _id: string;
  name: string;
  slug: string;
  category_id?: string;
  gst?: number;
  hsn_code?: string;
  sac_code?: string;
  tax_category?: string;
  // Category-level tax/fulfillment defaults inherited by products (product wins).
  delivery_time?: string;
  meta_title?: string;
  meta_description?: string;
  overview_fields?: IOverviewField[];
  // Category-level storefront visibility defaults for common product-page fields.
  field_visibility?: Record<string, boolean>;
  // Category-wide attribute defaults (key -> value) inherited by every product in
  // the category unless the product sets its own value. Eliminates per-product
  // repetition of category-constant attributes. GST keeps its own `gst` field.
  common_attributes?: Record<string, unknown>;
  // Spec field definitions this category uses (label, type, options, unit,
  // default). Drives the admin spec form and storefront spec rendering.
  spec_schema?: ISpecSchemaField[];
  subCategories?: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface ISubCategory {
  _id: string;
  name: string;
  slug: string;
  category?: string;
  sub_category_id?: string;
  gst?: number;
  // Sub-category-level tax/fulfillment defaults; override the parent category and
  // are inherited by products (the product's own value still wins).
  hsn_code?: string;
  sac_code?: string;
  tax_category?: string;
  delivery_time?: string;
  // Optional sub-category-level attribute overrides; take precedence over the
  // parent category's common_attributes during product attribute inheritance.
  common_attributes?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface IBrand {
  _id: string;
  name: string;
  slug: string;
  brand_id?: string;
  image?: string;
  createdAt: Date;
  updatedAt: Date;
}

export type AttributeType = 'number' | 'select' | 'text' | 'boolean';

// Reusable, admin-managed definition of a product attribute (spec). Owns the
// presentation/validation metadata for an attribute `key`; a product stores only
// the value. Drives dynamic spec forms and filters per category/sub-category.
export interface IAttributeDefinition {
  _id: string;
  key: string;
  label: string;
  description?: string;
  type: AttributeType;
  unit?: string;
  options?: string[];
  required?: boolean;
  searchable?: boolean;
  filterable?: boolean;
  sortable?: boolean;
  default_value?: unknown;
  categories?: string[];
  sub_categories?: string[];
  order?: number;
  isActive?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface IVariantDimensions {
  length?: number;
  width?: number;
  height?: number;
  unit?: string;
}

// Per-SKU variant of a product (pack size / colour / etc). Optional and opt-in;
// products with no variants are unaffected. Distinguishing spec values live in
// the dynamic `attributes` map, mirroring ProductSpecification.
export interface IProductVariant {
  _id: string;
  product: string;
  sku?: string;
  barcode?: string;
  name?: string;
  attributes?: Record<string, unknown>;
  weight?: number;
  pack_size?: number;
  dimensions?: IVariantDimensions;
  price?: number;
  original_price?: number;
  discount?: number;
  stock_quantity?: number;
  pack_weight?: number;
  isActive?: boolean;
  order?: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface ICart {
  _id: string;
  user: string;
  products: ICartItem[];
  total_amount: number;
  tax_amount?: number;
  discount_amount: number;
  totalPackWeight: number;
  packSize: number;
  appliedCoupon?: boolean;
  appliedCouponName?: string;
  couponType?: string;
  maxCapDiscount?: number;
  couponUse?: string;
  totalDiscountPrice?: number;
  totalDiscountPercentage?: number;
  shippingDiscountPrice?: number;
  shippingDiscountPercentage?: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface ICartItem {
  product: string;
  quantity: number;
  price: number;
  packSize: number;
  discountPrice?: number;
  totalPackWeight?: number;
}

export interface IOrder {
  _id: string;
  orderId: string;
  user?: string;
  items: IOrderItem[];
  name: string;
  phone: string;
  email: string;
  address: string;
  town: string;
  state: string;
  pincode: string;
  landmark?: string;
  gstin?: string;
  total?: number;
  totalPackWeight?: number;
  shippingCost?: number;
  totalOrderValue: number;
  totalCartValue?: number;
  status: string;
  paymentStatus: string;
  paymentProvider?: string;
  paymentReference?: string;
  paymentDate?: Date;
  paymentFailedAt?: Date;
  paymentFailureReason?: string;
  utrNumber?: string;
  couponCode?: string;
  guestToken?: string;
  stockReduced: boolean;
  trackingId?: string;
  deliveryPartner?: string;
  shippingDate?: Date;
  deliveredDate?: Date;
  razorpayOrderId?: string;
  razorpayPaymentId?: string;
  razorpaySignature?: string;
  taxableAmount?: number;
  idempotencyKey?: string;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface IOrderItem {
  product: string;
  quantity: number;
  price: number;
  packSize: number;
  gst?: number;
  gstAmount?: number;
  totalPrice?: number;
  // Resolved HSN code for this line (product -> sub_category -> category), captured
  // at order time for the GST invoice.
  hsn_code?: string;
}

export interface ICoupon {
  _id: string;
  couponCode: string;
  description?: string;
  discountType: string;
  discountValue: number;
  maxDiscount?: number;
  minOrderValue?: number;
  validFrom: Date;
  validTo: Date;
  usageLimit?: number;
  usedCount: number;
  isActive: boolean;
  appliesTo?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface IWishlist {
  _id: string;
  user: string;
  products: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface IPincode {
  _id: string;
  pincode: string;
  deliveryAvailable: boolean;
  codAvailable: boolean;
  estimatedDays?: number;
  freight?: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface INotify {
  _id: string;
  email_address: string;
  product_id: string;
  mail_sent: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface IDeal {
  _id: string;
  title: string;
  description?: string;
  discountPercentage?: number;
  products?: string[];
  isActive: boolean;
  validFrom?: Date;
  validTo?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface ICustomPackaging {
  _id: string;
  name: string;
  email: string;
  phone: string;
  description: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface IContactForm {
  _id: string;
  name: string;
  email: string;
  phone?: string;
  category: 'Bug' | 'Order' | 'Payment' | 'Feedback' | 'Other';
  message: string;
  status: 'open' | 'in_progress' | 'resolved' | 'closed';
  userId?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ISubscriptionOrder {
  _id: string;
  email: string;
  product: string;
  quantity: number;
  frequency: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface IAppVersion {
  _id: string;
  platform: string;
  version: string;
  forceUpdate: boolean;
  updateMessage?: string;
  createdAt: Date;
  updatedAt: Date;
}

export type NotificationChannel = 'email' | 'push' | 'inapp';

export interface INotificationTemplate {
  _id: string;
  key: string;
  channel: NotificationChannel;
  name: string;
  description?: string;
  subject: string;
  body: string;
  variables: string[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface INotificationItem {
  _id: string;
  user: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  source: 'broadcast' | 'event';
  templateKey?: string;
  campaign?: string;
  isRead: boolean;
  readAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface INotificationCampaign {
  _id: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  audience: 'all' | 'role' | 'users';
  audienceRef?: string;
  recipientCount: number;
  pushSent: number;
  emailSent: number;
  createdBy?: string;
  createdByName?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface IUserDevice {
  _id: string;
  user: string;
  token: string;
  platform: 'android' | 'ios';
  lastSeenAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface ICounter {
  _id: string;
  name: string;
  seq: number;
}

export interface IProductGstResult {
  itemsWithGst: IOrderItem[];
  taxableAmount: number;
  totalOrderValue: number;
  totalGst: number;
}

export interface IAuthPayload {
  id: string;
  first_name: string;
  last_name: string;
  role: string;
  mobile_number?: string;
  profile_image?: string;
  couponUsed?: string[];
}

export interface IAuthRequest extends Request {
  user?: string;
  userRole?: string;
  userName?: string;
}

export interface IPaginationMeta {
  total: number;
  skip: number;
  limit: number | null;
  returned: number;
  hasMore: boolean;
}

export interface IApiResponse<T = unknown> {
  message: string;
  success: boolean;
  data?: T;
  meta?: IPaginationMeta;
}

export interface IImageSignOptions {
  expiresIn: number;
  /**
   * When set, sign a resized thumbnail derivative (≤ this width in px) instead
   * of the full-size original. The derivative is generated lazily on first use
   * and cached in S3. Used for product cards / list views.
   */
  width?: number;
}
